// Utilitário para extração de texto de DOCX e PDF usando APIs nativas do Deno
// DOCX é um arquivo ZIP contendo word/document.xml comprimido (geralmente deflate/deflate-raw).

/**
 * Descomprime bytes usando DecompressionStream nativo do Deno/Web Streams API
 */
async function decompressDeflateRaw(compressedBytes: Uint8Array): Promise<Uint8Array> {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(compressedBytes)
      controller.close()
    },
  })
  const decompressedStream = stream.pipeThrough(new DecompressionStream('deflate-raw'))
  const response = new Response(decompressedStream)
  const buffer = await response.arrayBuffer()
  return new Uint8Array(buffer)
}

/**
 * Faz parse manual do ZIP do arquivo .docx para extrair o XML `word/document.xml`
 * e converte as tags `<w:t>` e quebras `<w:p>` em texto formatado legível.
 */
export async function extractRawTextFromDocxBytes(bytes: Uint8Array): Promise<string> {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let offset = 0
    let xmlBytes: Uint8Array | null = null

    // 1. Tentar iterar pelas Local File Headers do ZIP (PK\x03\x04 = 0x04034b50 little-endian)
    while (offset + 30 <= bytes.length) {
      const signature = view.getUint32(offset, true)
      if (signature !== 0x04034b50) {
        break
      }

      const flags = view.getUint16(offset + 6, true)
      const compressionMethod = view.getUint16(offset + 8, true)
      let compressedSize = view.getUint32(offset + 18, true)
      let uncompressedSize = view.getUint32(offset + 22, true)
      const fileNameLength = view.getUint16(offset + 26, true)
      const extraFieldLength = view.getUint16(offset + 28, true)

      const fileNameBytes = bytes.subarray(offset + 30, offset + 30 + fileNameLength)
      const fileName = new TextDecoder('utf-8', { fatal: false }).decode(fileNameBytes)

      const dataOffset = offset + 30 + fileNameLength + extraFieldLength

      // Se flag bit 3 estiver setada (data descriptor), os tamanhos podem estar 0 no header local.
      // Nesse caso ou no caso padrão, se for word/document.xml e compressedSize for 0, procuramos pelo Central Directory.
      if (
        fileName === 'word/document.xml' ||
        fileName.endsWith('/document.xml') ||
        fileName === 'word/document2.xml'
      ) {
        if (compressedSize > 0 && dataOffset + compressedSize <= bytes.length) {
          const fileData = bytes.subarray(dataOffset, dataOffset + compressedSize)
          if (compressionMethod === 8) {
            xmlBytes = await decompressDeflateRaw(fileData)
          } else if (compressionMethod === 0) {
            xmlBytes = fileData
          }
          break
        }
      }

      if (compressedSize > 0) {
        offset = dataOffset + compressedSize
      } else {
        // Se compressedSize não estiver no header local, avança 1 byte para tentar achar o próximo
        offset += 4
      }
    }

    // 2. Se não encontrou pelo local header (ex: streaming zip com data descriptor), busca pelo Central Directory (PK\x01\x02 = 0x02014b50)
    if (!xmlBytes) {
      let cdOffset = 0
      while (cdOffset + 46 <= bytes.length) {
        const signature = view.getUint32(cdOffset, true)
        if (signature === 0x02014b50) {
          const compressionMethod = view.getUint16(cdOffset + 10, true)
          const compressedSize = view.getUint32(cdOffset + 20, true)
          const fileNameLength = view.getUint16(cdOffset + 28, true)
          const extraFieldLength = view.getUint16(cdOffset + 30, true)
          const fileCommentLength = view.getUint16(cdOffset + 32, true)
          const localHeaderOffset = view.getUint32(cdOffset + 42, true)

          const fileNameBytes = bytes.subarray(cdOffset + 46, cdOffset + 46 + fileNameLength)
          const fileName = new TextDecoder('utf-8', { fatal: false }).decode(fileNameBytes)

          if (fileName === 'word/document.xml' || fileName.endsWith('/document.xml')) {
            // Ler header local para saber o offset real dos dados
            if (localHeaderOffset + 30 <= bytes.length) {
              const localFileNameLen = view.getUint16(localHeaderOffset + 26, true)
              const localExtraLen = view.getUint16(localHeaderOffset + 28, true)
              const realDataOffset = localHeaderOffset + 30 + localFileNameLen + localExtraLen

              if (realDataOffset + compressedSize <= bytes.length) {
                const fileData = bytes.subarray(realDataOffset, realDataOffset + compressedSize)
                if (compressionMethod === 8) {
                  xmlBytes = await decompressDeflateRaw(fileData)
                } else if (compressionMethod === 0) {
                  xmlBytes = fileData
                }
                break
              }
            }
          }

          cdOffset += 46 + fileNameLength + extraFieldLength + fileCommentLength
        } else {
          cdOffset++
        }
      }
    }

    let xmlContent = ''
    if (xmlBytes) {
      xmlContent = new TextDecoder('utf-8', { fatal: false }).decode(xmlBytes)
    } else {
      // Fallback: se não conseguiu descompactar, decodifica bytes brutos
      xmlContent = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    }

    // Processar XML do Word:
    // Tratar parágrafos (<w:p ...>) e quebras de linha (<w:br/>, <w:cr/>)
    const normalizedXml = xmlContent
      .replace(/<w:br[^>]*>/gi, '\n')
      .replace(/<w:cr[^>]*>/gi, '\n')
      .replace(/<\/w:p>/gi, '\n')
      .replace(/<\/w:tr>/gi, '\n')
      .replace(/<\/w:tc>/gi, '\t')

    // Extrair conteúdo de tags <w:t>
    const textMatches = normalizedXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|(\n)/gi)
    const lines: string[] = []
    let currentLine = ''

    for (const match of textMatches) {
      if (match[2] === '\n') {
        if (currentLine.trim().length > 0) {
          lines.push(currentLine.trim())
        }
        currentLine = ''
      } else if (match[1]) {
        currentLine += match[1] + ' '
      }
    }
    if (currentLine.trim().length > 0) {
      lines.push(currentLine.trim())
    }

    const result = lines.join('\n').trim()
    if (result.length > 0) {
      return result
    }

    // Fallback: strip tags
    const stripped = xmlContent
      .replace(/<[^>]+>/g, ' ')
      .replace(/[^\x20-\x7E\xC0-\xFF\n\r\t]/g, ' ')
    return stripped.replace(/\s+/g, ' ').trim()
  } catch (err) {
    console.warn('Erro ao extrair texto do DOCX via ZIP parser:', err)
    try {
      const decoder = new TextDecoder('utf-8', { fatal: false })
      const content = decoder.decode(bytes)
      const stripped = content.replace(/<[^>]+>/g, ' ').replace(/[^\x20-\x7E\xC0-\xFF\n\r\t]/g, ' ')
      return stripped.replace(/\s+/g, ' ').trim()
    } catch {
      return ''
    }
  }
}
