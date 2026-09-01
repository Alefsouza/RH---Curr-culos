/**
 * Helper compartilhado para OCR de arquivos (especialmente PDF e imagens) via Google Cloud Vision API.
 * Faz requisição para a API DOCUMENT_TEXT_DETECTION do Google Vision usando GOOGLE_API_KEY.
 * Trata erros de forma graciosa retornando string vazia, sem quebrar o fluxo chamador.
 */

function uint8ArrayToBase64(bytes: Uint8Array): string {
  // Para buffers menores/médios, chunking evita exceder call stack de String.fromCharCode
  const CHUNK_SIZE = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE)
    binary += String.fromCharCode.apply(null, Array.from(chunk))
  }
  return btoa(binary)
}

/**
 * Executa OCR de um PDF usando Google Cloud Vision API (files:annotate).
 * @param pdfBytes Uint8Array com os bytes do PDF
 * @returns Texto extraído de todas as páginas concatenado, ou '' em caso de erro/falha
 */
export async function performGoogleVisionPdfOcr(pdfBytes: Uint8Array): Promise<string> {
  if (!pdfBytes || pdfBytes.length === 0) return ''

  const apiKey = Deno.env.get('GOOGLE_API_KEY')
  if (!apiKey) {
    console.warn('[ocr] GOOGLE_API_KEY não configurada no ambiente.')
    return ''
  }

  try {
    const base64Pdf = uint8ArrayToBase64(pdfBytes)

    const url = `https://vision.googleapis.com/v1/files:annotate?key=${encodeURIComponent(apiKey)}`

    const requestBody = {
      requests: [
        {
          inputConfig: {
            mimeType: 'application/pdf',
            content: base64Pdf,
          },
          features: [
            {
              type: 'DOCUMENT_TEXT_DETECTION',
            },
          ],
        },
      ],
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      console.warn(
        `[ocr] Google Vision API respondeu com status ${response.status}: ${errText.substring(0, 300)}`,
      )
      return ''
    }

    const data = await response.json()
    const responses = data?.responses?.[0]?.responses || []

    const pageTexts: string[] = []
    for (const pageResp of responses) {
      if (pageResp?.fullTextAnnotation?.text) {
        pageTexts.push(pageResp.fullTextAnnotation.text)
      } else if (pageResp?.textAnnotations?.[0]?.description) {
        pageTexts.push(pageResp.textAnnotations[0].description)
      }
    }

    const fullOcrText = pageTexts.join('\n\n').trim()
    console.log(
      `[ocr] Google Vision OCR executado com sucesso: ${fullOcrText.length} caracteres extraídos de ${responses.length} página(s).`,
    )
    return fullOcrText
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.warn('[ocr] Timeout ao chamar Google Vision API.')
    } else {
      console.warn('[ocr] Erro ao executar OCR via Google Vision:', err?.message || err)
    }
    return ''
  }
}
