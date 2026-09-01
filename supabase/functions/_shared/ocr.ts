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
function extractTextFromPageResponses(responses: any[]): string {
  if (!Array.isArray(responses)) return ''
  const pageTexts: string[] = []
  for (const pageResp of responses) {
    if (pageResp?.fullTextAnnotation?.text) {
      pageTexts.push(pageResp.fullTextAnnotation.text)
    } else if (pageResp?.textAnnotations?.[0]?.description) {
      pageTexts.push(pageResp.textAnnotations[0].description)
    }
  }
  return pageTexts.join('\n\n').trim()
}

export async function performGoogleVisionPdfOcr(pdfBytes: Uint8Array): Promise<string> {
  if (!pdfBytes || pdfBytes.length === 0) return ''

  const apiKey = Deno.env.get('GOOGLE_API_KEY')
  if (!apiKey) {
    console.error('[ocr] GOOGLE_API_KEY não configurada no ambiente.')
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

    const initialController = new AbortController()
    const initialTimeoutId = setTimeout(() => initialController.abort(), 25000)

    let postResponse: Response
    try {
      postResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: initialController.signal,
      })
    } finally {
      clearTimeout(initialTimeoutId)
    }

    if (!postResponse.ok) {
      const errText = await postResponse.text().catch(() => '')
      console.error(
        `[ocr] Google Vision files:annotate falhou com status ${postResponse.status}:`,
        errText,
      )
      return ''
    }

    const initialData = await postResponse.json()

    // Caso de compatibilidade: se já vier responses pronto de forma síncrona
    if (!initialData?.name && initialData?.responses) {
      const responses = initialData.responses?.[0]?.responses || initialData.responses || []
      const extractedText = extractTextFromPageResponses(responses)
      console.log(
        `[ocr] Google Vision OCR executado diretamente (síncrono): ${extractedText.length} caracteres extraídos.`,
      )
      return extractedText
    }

    const operationName = initialData?.name
    if (!operationName) {
      // Caso não tenha name nem responses reconhecíveis
      if (initialData?.responses?.[0]?.responses) {
        const responses = initialData.responses[0].responses
        return extractTextFromPageResponses(responses)
      }
      console.error(
        '[ocr] Resposta inesperada do Google Vision files:annotate (sem campo name nem responses):',
        initialData,
      )
      return ''
    }

    // Polling da operação assíncrona por até ~25 segundos
    const operationUrl = `https://vision.googleapis.com/v1/${encodeURI(operationName)}?key=${encodeURIComponent(apiKey)}`
    const startTime = Date.now()
    const MAX_POLL_DURATION_MS = 25000
    const POLL_INTERVAL_MS = 1500

    while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

      let pollResponse: Response
      try {
        pollResponse = await fetch(operationUrl)
      } catch (pollFetchErr: any) {
        console.error(
          `[ocr] Erro de rede ao fazer polling da operação ${operationName}:`,
          pollFetchErr?.message || pollFetchErr,
        )
        continue
      }

      if (!pollResponse.ok) {
        const pollErrText = await pollResponse.text().catch(() => '')
        console.error(
          `[ocr] Google Vision polling da operação ${operationName} falhou com status ${pollResponse.status}:`,
          pollErrText,
        )
        return ''
      }

      const operationData = await pollResponse.json()

      if (operationData?.error) {
        console.error(
          `[ocr] Operação do Google Vision ${operationName} terminou com erro:`,
          operationData.error,
        )
        return ''
      }

      if (operationData?.done === true) {
        const pageResponses =
          operationData?.response?.responses?.[0]?.responses ||
          operationData?.response?.responses ||
          []
        const fullOcrText = extractTextFromPageResponses(pageResponses)
        console.log(
          `[ocr] Google Vision OCR (polling concluído): ${fullOcrText.length} caracteres extraídos de ${pageResponses.length} página(s).`,
        )
        return fullOcrText
      }
    }

    console.error(
      `[ocr] Timeout no polling da operação do Google Vision ${operationName} após ${MAX_POLL_DURATION_MS}ms.`,
    )
    return ''
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.error('[ocr] Timeout ao chamar Google Vision API.')
    } else {
      console.error('[ocr] Erro ao executar OCR via Google Vision:', err?.message || err)
    }
    return ''
  }
}
