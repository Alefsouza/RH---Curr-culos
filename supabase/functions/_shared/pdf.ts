/**
 * Utilitário para extração de texto de PDFs usando decodificação PDF nativa (Deno / TypeScript).
 * Suporta:
 * 1. Blocos de texto PDF (BT ... ET)
 * 2. Operadores de texto Tj com strings literais `(...)`
 * 3. Operadores de array TJ `[(V)-10(ALD)-5(IN)\311(IA)] TJ`
 * 4. Escapes em octal padrão PDF (ex: `\311` -> 'É', `\341` -> 'á', `\351` -> 'é', `\343` -> 'ã', `\347` -> 'ç')
 * 5. Escapes especiais PDF (`\n`, `\r`, `\t`, `\b`, `\f`, `\(`, `\)`, `\\`)
 * 6. Hex strings `<48656c6c6f>` (incluindo UTF-16BE quando presente)
 * 7. Fallback para descompressão de streams FlateDecode se houver streams zlib/deflate
 * 8. Fallback para decodificação textual geral
 */

// Mapeamento de octal/WinAnsi / PDFDocEncoding / ISO-8859-1 para caracteres Unicode
function decodePdfOctalEscapes(text: string): string {
  // Substitui sequências octais \ddd (1 a 3 dígitos octais)
  return text.replace(/\\([0-7]{1,3})/g, (_match, octalStr) => {
    const charCode = parseInt(octalStr, 8)
    if (charCode >= 0 && charCode <= 255) {
      // Usar decodificação Windows-1252 / ISO-8859-1 para converter byte em caractere correto
      // No Windows-1252 / ISO-8859-1: \311 = 201 = 'É', \341 = 225 = 'á', \351 = 233 = 'é', \343 = 227 = 'ã', \347 = 231 = 'ç'
      const bytes = new Uint8Array([charCode])
      try {
        const decoded = new TextDecoder('windows-1252').decode(bytes)
        return decoded
      } catch {
        return String.fromCharCode(charCode)
      }
    }
    return String.fromCharCode(charCode)
  })
}

// Decodifica literais PDF como `(Texto \(com parênteses\) \311)`
function decodePdfLiteralString(rawLiteral: string): string {
  // Primeiro resolve escapes octais (\311, \341, etc.)
  let s = decodePdfOctalEscapes(rawLiteral)

  // Resolve escapes de caracteres de controle comuns no PDF
  s = s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\r?\n/g, '') // quebra de linha escapada é ignorada no PDF
    .replace(/\\([()\\])/g, '$1') // \(, \), \\

  // Se houver UTF-16BE BOM (\xfe\xff)
  if (s.startsWith('\u00fe\u00ff') || s.startsWith('\xfe\xff')) {
    const bytes = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) {
      bytes[i] = s.charCodeAt(i)
    }
    try {
      return new TextDecoder('utf-16be').decode(bytes.subarray(2))
    } catch {
      // continua com s
    }
  }

  return s
}

// Decodifica strings hexadecimais no PDF `<48656C6C6F>` ou `<FEFF00560041...>`
function decodePdfHexString(hexRaw: string): string {
  const cleanHex = hexRaw.replace(/\s+/g, '')
  if (cleanHex.length === 0) return ''

  // Se o número de dígitos for ímpar, o PDF spec diz para completar com 0 no final
  const paddedHex = cleanHex.length % 2 !== 0 ? cleanHex + '0' : cleanHex
  const bytes = new Uint8Array(paddedHex.length / 2)

  for (let k = 0; k < paddedHex.length; k += 2) {
    bytes[k / 2] = parseInt(paddedHex.substring(k, k + 2), 16)
  }

  // Verifica se é UTF-16BE (começa com FE FF)
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    try {
      return new TextDecoder('utf-16be').decode(bytes.subarray(2))
    } catch {
      // fallback abaixo
    }
  }

  // Tenta decodificar como UTF-8
  try {
    const utf8Str = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    // Se conter caracteres legíveis
    if (/[a-zA-ZÀ-ÿ0-9]/.test(utf8Str)) {
      return utf8Str
    }
  } catch {
    // Não é UTF-8 estrito
  }

  // Tenta windows-1252 / latin1
  try {
    const winStr = new TextDecoder('windows-1252').decode(bytes)
    if (/[a-zA-ZÀ-ÿ0-9]/.test(winStr)) {
      return winStr
    }
  } catch {
    // fallback
  }

  let str = ''
  for (let i = 0; i < bytes.length; i++) {
    const code = bytes[i]
    if (code >= 32 && code <= 255) {
      str += String.fromCharCode(code)
    }
  }
  return str
}

// Extrai texto de um array de texto TJ: `[ (VALDIN) -10 (\311) -5 (IA) ] TJ` ou `[ <0056> 10 <0041> ] TJ`
function parseTJArray(arrayContent: string): string {
  let result = ''
  // Regex para capturar tanto strings literais `(...)` quanto hex strings `<...>` dentro do array `[...]`
  // Tratando parênteses balanceados ou escapados
  const itemRegex = /\((?:[^()\\]|\\.)*\)|<[0-9a-fA-F\s]+>/g
  let match: RegExpExecArray | null

  while ((match = itemRegex.exec(arrayContent)) !== null) {
    const token = match[0]
    if (token.startsWith('(') && token.endsWith(')')) {
      const inner = token.substring(1, token.length - 1)
      result += decodePdfLiteralString(inner)
    } else if (token.startsWith('<') && token.endsWith('>')) {
      const inner = token.substring(1, token.length - 1)
      result += decodePdfHexString(inner)
    }
  }

  return result
}

/**
 * Tenta descomprimir streams FlateDecode do PDF para obter operadores BT..ET em streams comprimidos
 */
async function decompressFlateStream(streamBytes: Uint8Array): Promise<Uint8Array | null> {
  // Procura se tem zlib header (0x78 0x9c, 0x78 0x01, 0x78 0xda, etc.) ou raw deflate
  try {
    // Deno DecompressionStream 'deflate' trata zlib wrapper
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(streamBytes)
        controller.close()
      },
    })
    const decompressedStream = stream.pipeThrough(new DecompressionStream('deflate'))
    const res = new Response(decompressedStream)
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  } catch {
    try {
      // Tentar 'deflate-raw'
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(streamBytes)
          controller.close()
        },
      })
      const decompressedStream = stream.pipeThrough(new DecompressionStream('deflate-raw'))
      const res = new Response(decompressedStream)
      const buf = await res.arrayBuffer()
      return new Uint8Array(buf)
    } catch {
      return null
    }
  }
}

/**
 * Faz a varredura e extrai texto de todos os blocos BT ... ET de uma string de conteúdo PDF
 */
function extractTextFromPdfContentString(contentStr: string): string[] {
  const chunks: string[] = []

  // 1. Extrair de blocos BT ... ET
  const btMatches = contentStr.matchAll(/BT([\s\S]*?)ET/g)
  for (const match of btMatches) {
    const block = match[1]

    // 1.1 Operadores TJ: `[ ... ] TJ`
    const tjMatches = block.matchAll(/\[([\s\S]*?)\]\s*TJ/g)
    for (const tj of tjMatches) {
      const parsed = parseTJArray(tj[1])
      if (parsed.trim().length > 0) {
        chunks.push(parsed.trim())
      }
    }

    // 1.2 Operadores Tj, ' e ": `(texto) Tj` ou `<hex> Tj`
    const singleTjMatches = block.matchAll(
      /(?:\(((?:[^()\\]|\\.)*)\)|<([0-9a-fA-F\s]+)>)\s*(?:Tj|'|")/g,
    )
    for (const stj of singleTjMatches) {
      if (stj[1] !== undefined) {
        const decoded = decodePdfLiteralString(stj[1])
        if (decoded.trim().length > 0) {
          chunks.push(decoded.trim())
        }
      } else if (stj[2] !== undefined) {
        const decoded = decodePdfHexString(stj[2])
        if (decoded.trim().length > 0) {
          chunks.push(decoded.trim())
        }
      }
    }

    // 1.3 Outros literais soltos dentro de BT..ET se não pegou por operadores
    if (chunks.length === 0) {
      const fallbackLiterals = block.matchAll(/\(((?:[^()\\]|\\.)*)\)/g)
      for (const lit of fallbackLiterals) {
        const decoded = decodePdfLiteralString(lit[1])
        if (decoded.trim().length > 0) {
          chunks.push(decoded.trim())
        }
      }
    }
  }

  // 2. Se não encontrou blocos BT..ET na string, busca arrays `[...] TJ` ou literais `(...) Tj` no conteúdo geral
  if (chunks.length === 0) {
    const generalTjMatches = contentStr.matchAll(/\[([\s\S]*?)\]\s*TJ/g)
    for (const tj of generalTjMatches) {
      const parsed = parseTJArray(tj[1])
      if (parsed.trim().length > 0) {
        chunks.push(parsed.trim())
      }
    }

    const generalSingleMatches = contentStr.matchAll(
      /(?:\(((?:[^()\\]|\\.)*)\)|<([0-9a-fA-F\s]+)>)\s*(?:Tj|'|")/g,
    )
    for (const stj of generalSingleMatches) {
      if (stj[1] !== undefined) {
        const decoded = decodePdfLiteralString(stj[1])
        if (decoded.trim().length > 0) {
          chunks.push(decoded.trim())
        }
      } else if (stj[2] !== undefined) {
        const decoded = decodePdfHexString(stj[2])
        if (decoded.trim().length > 0) {
          chunks.push(decoded.trim())
        }
      }
    }
  }

  return chunks
}

/**
 * Função principal para extrair texto legível e acentuado de um buffer PDF (Uint8Array).
 * Processa streams comprimidos FlateDecode, blocos BT...ET, literais com octais (\311, \341...) e TJ arrays.
 */
export async function extractTextFromPdfBytes(bytes: Uint8Array): Promise<string> {
  if (!bytes || bytes.length === 0) return ''

  const allChunks: string[] = []

  // 1. Decodificar bytes brutos em string (tentando UTF-8 e Windows-1252)
  let rawStr = ''
  try {
    rawStr = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    rawStr = new TextDecoder('windows-1252').decode(bytes)
  }

  // 2. Extrair texto de blocos não-comprimidos diretamente
  const directChunks = extractTextFromPdfContentString(rawStr)
  if (directChunks.length > 0) {
    allChunks.push(...directChunks)
  }

  // 3. Procurar por streams de objetos PDF `stream ... endstream` e descomprimir
  // Localiza offsets binários de "stream\r?\n" até "endstream"
  try {
    const streamHeader = new TextEncoder().encode('stream')
    const endStreamHeader = new TextEncoder().encode('endstream')

    let searchPos = 0
    while (searchPos < bytes.length) {
      // Encontra "stream"
      let streamStart = -1
      for (let i = searchPos; i <= bytes.length - streamHeader.length; i++) {
        if (
          bytes[i] === streamHeader[0] &&
          bytes[i + 1] === streamHeader[1] &&
          bytes[i + 2] === streamHeader[2] &&
          bytes[i + 3] === streamHeader[3] &&
          bytes[i + 4] === streamHeader[4] &&
          bytes[i + 5] === streamHeader[5]
        ) {
          streamStart = i + 6
          break
        }
      }

      if (streamStart === -1) break

      // Pula CRLF após "stream"
      if (bytes[streamStart] === 0x0d && bytes[streamStart + 1] === 0x0a) {
        streamStart += 2
      } else if (bytes[streamStart] === 0x0a || bytes[streamStart] === 0x0d) {
        streamStart += 1
      }

      // Encontra "endstream"
      let streamEnd = -1
      for (let j = streamStart; j <= bytes.length - endStreamHeader.length; j++) {
        if (
          bytes[j] === endStreamHeader[0] &&
          bytes[j + 1] === endStreamHeader[1] &&
          bytes[j + 2] === endStreamHeader[2] &&
          bytes[j + 3] === endStreamHeader[3] &&
          bytes[j + 4] === endStreamHeader[4] &&
          bytes[j + 5] === endStreamHeader[5] &&
          bytes[j + 6] === endStreamHeader[6] &&
          bytes[j + 7] === endStreamHeader[7] &&
          bytes[j + 8] === endStreamHeader[8]
        ) {
          streamEnd = j
          break
        }
      }

      if (streamEnd === -1) break

      // Tira possíveis quebras de linha antes de endstream
      let realEnd = streamEnd
      while (
        realEnd > streamStart &&
        (bytes[realEnd - 1] === 0x0a || bytes[realEnd - 1] === 0x0d)
      ) {
        realEnd--
      }

      if (realEnd > streamStart) {
        const streamSlice = bytes.subarray(streamStart, realEnd)
        const decompressed = await decompressFlateStream(streamSlice)
        if (decompressed && decompressed.length > 0) {
          let decompressedStr = ''
          try {
            decompressedStr = new TextDecoder('utf-8', { fatal: false }).decode(decompressed)
          } catch {
            decompressedStr = new TextDecoder('windows-1252').decode(decompressed)
          }
          const streamChunks = extractTextFromPdfContentString(decompressedStr)
          if (streamChunks.length > 0) {
            allChunks.push(...streamChunks)
          }
        }
      }

      searchPos = streamEnd + 9
    }
  } catch (err) {
    console.warn('Erro ao processar streams FlateDecode do PDF:', err)
  }

  // 4. Se encontrou blocos, une e limpa
  if (allChunks.length > 0) {
    // Remove duplicatas consecutivas idênticas e normaliza espaços
    const joined = allChunks.join(' ').replace(/\s+/g, ' ').trim()
    if (joined.length > 0) {
      return joined
    }
  }

  // 5. Fallback final: busca todas as strings literais entre parênteses no arquivo bruto com octais decodificados
  const fallbackLitMatches = rawStr.matchAll(/\(((?:[^()\\]|\\.)*)\)/g)
  const fallbackList: string[] = []
  for (const match of fallbackLitMatches) {
    const s = decodePdfLiteralString(match[1])
    if (s.trim().length > 1 && /[a-zA-ZÀ-ÿ]/.test(s)) {
      fallbackList.push(s.trim())
    }
  }

  return fallbackList.join(' ').replace(/\s+/g, ' ').trim()
}
