export interface UazapiCheckNumberResult {
  query: string
  isInWhatsapp: boolean
  jid?: string
  verifiedName?: string
  error?: string
}

/**
 * Extrai a mensagem de erro real retornada pela UazAPI a partir do corpo de resposta
 * ou erro capturado.
 * Exemplos reais de respostas da UazAPI:
 * {"error":"the number 5511917024529@s.whatsapp.net is not on WhatsApp"}
 * {"message":"number not on WhatsApp"}
 * {"error":{"message":"..."}}
 */
export function extractUazapiErrorMessage(rawError: any): string {
  if (!rawError) return 'Erro desconhecido na UazAPI'

  if (typeof rawError === 'string') {
    const trimmed = rawError.trim()
    try {
      const parsed = JSON.parse(trimmed)
      return extractUazapiErrorMessage(parsed)
    } catch {
      return trimmed
    }
  }

  if (typeof rawError === 'object') {
    if (typeof rawError.error === 'string' && rawError.error.trim()) {
      return rawError.error.trim()
    }

    if (rawError.error && typeof rawError.error === 'object') {
      if (typeof rawError.error.message === 'string' && rawError.error.message.trim()) {
        return rawError.error.message.trim()
      }
      if (typeof rawError.error.error === 'string' && rawError.error.error.trim()) {
        return rawError.error.error.trim()
      }
    }

    if (typeof rawError.message === 'string' && rawError.message.trim()) {
      return rawError.message.trim()
    }

    if (typeof rawError.detalhe === 'string' && rawError.detalhe.trim()) {
      return rawError.detalhe.trim()
    }
    if (typeof rawError.response === 'string' && rawError.response.trim()) {
      return extractUazapiErrorMessage(rawError.response)
    }

    if (typeof rawError.msg === 'string' && rawError.msg.trim()) {
      return rawError.msg.trim()
    }
    if (typeof rawError.reason === 'string' && rawError.reason.trim()) {
      return rawError.reason.trim()
    }

    try {
      return JSON.stringify(rawError)
    } catch {
      return String(rawError)
    }
  }

  return String(rawError)
}

/**
 * Normaliza e simplifica o texto do erro da UazAPI para exibição amigável ao RH.
 * Mantém os detalhes técnicos preservando o motivo real.
 */
export function formatUazapiErrorForDisplay(errorMessage: string): string {
  if (!errorMessage) return 'Falha no envio'

  const lower = errorMessage.toLowerCase()

  if (
    lower.includes('is not on whatsapp') ||
    lower.includes('not on whatsapp') ||
    lower.includes('number not on whatsapp')
  ) {
    return 'Número não registrado no WhatsApp'
  }
  if (
    lower.includes('invalid number') ||
    lower.includes('número inválido') ||
    lower.includes('invalid phone')
  ) {
    return 'Número de telefone inválido'
  }
  if (
    lower.includes('instance') &&
    (lower.includes('disconnected') || lower.includes('desconectada'))
  ) {
    return 'Instância do WhatsApp desconectada'
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Limite de envios atingido (aguarde)'
  }

  return errorMessage
}

/**
 * Valida na UazAPI se os números estão registrados no WhatsApp usando POST /chat/check?instance=...
 * Body: { numbers: ["5511917024529", ...] }
 * Retorno: [{ query: "5511917024529", isInWhatsapp: false, error: "the number ... is not on WhatsApp" }]
 */
export async function checkNumbersOnWhatsApp(params: {
  baseUrl: string
  instanceId: string
  token: string
  numbers: string[]
}): Promise<Record<string, UazapiCheckNumberResult>> {
  const { baseUrl, instanceId, token, numbers } = params
  const results: Record<string, UazapiCheckNumberResult> = {}

  if (!numbers || numbers.length === 0) return results

  const cleanNumbers = numbers
    .map((n) => {
      let clean = n.replace(/\D/g, '')
      if (clean && !clean.startsWith('55')) clean = '55' + clean
      return clean
    })
    .filter((n) => n.length >= 12 && n.length <= 15)

  if (cleanNumbers.length === 0) return results

  try {
    const url = `${baseUrl}/chat/check?instance=${instanceId}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: token,
        Authorization: `Bearer ${token}`,
        token,
      },
      body: JSON.stringify({ numbers: cleanNumbers }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (response.ok) {
      const data = await response.json()
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item?.query) {
            results[item.query] = {
              query: item.query,
              isInWhatsapp: Boolean(item.isInWhatsapp),
              jid: item.jid || '',
              verifiedName: item.verifiedName || '',
              error: item.error || '',
            }
          }
        }
      }
    } else {
      console.warn(
        `[checkNumbersOnWhatsApp] API retornou status ${response.status}: ${await response.text()}`,
      )
    }
  } catch (err: any) {
    console.warn(`[checkNumbersOnWhatsApp] Falha ao verificar números:`, err.message)
  }

  return results
}
