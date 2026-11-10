/**
 * OCR de IMAGENS (JPG/JPEG/PNG/WEBP/HEIC) via Google Cloud Vision API.
 * Usa o mesmo GOOGLE_API_KEY já usado para PDF (arquivos files:annotate suportam
 * imagens também, mas o endpoint images:annotate é o caminho síncrono e direto).
 * Erros são tratados graciosamente (string vazia), sem quebrar o chamador.
 */

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE)
    binary += String.fromCharCode.apply(null, Array.from(chunk))
  }
  return btoa(binary)
}

export function isImageExtension(fileName: string): boolean {
  const ext = (fileName || '').toLowerCase().split('.').pop()
  return !!ext && ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)
}

export function imageContentTypeFor(fileName: string): string {
  const ext = (fileName || '').toLowerCase().split('.').pop() || 'jpeg'
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
  }
  return map[ext] || 'image/jpeg'
}

/**
 * Executa OCR de uma imagem de currículo e devolve o texto extraído ('' em falha).
 */
export async function performGoogleVisionImageOcr(
  imageBytes: Uint8Array,
  mimeType = 'image/jpeg',
): Promise<string> {
  if (!imageBytes || imageBytes.length === 0) return ''

  const apiKey = Deno.env.get('GOOGLE_API_KEY')
  if (!apiKey) {
    console.error('[ocr-image] GOOGLE_API_KEY não configurada no ambiente.')
    return ''
  }

  try {
    const base64 = uint8ArrayToBase64(imageBytes)
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000)

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            imageContext: { languageHints: ['pt-BR'] },
          },
        ],
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error(`[ocr-image] images:annotate falhou com status ${res.status}:`, errText)
      return ''
    }

    const data = await res.json()
    const annotation = data?.responses?.[0]?.fullTextAnnotation
    const text = (
      annotation?.text ||
      data?.responses?.[0]?.textAnnotations?.[0]?.description ||
      ''
    ).trim()
    console.log(`[ocr-image] OCR de imagem concluído: ${text.length} caracteres extraídos.`)
    return text
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.error('[ocr-image] Timeout ao conectar com Google Vision API (AbortError).')
    } else {
      console.error('[ocr-image] Erro no OCR de imagem:', err?.message || err)
    }
    return ''
  }
}
