export const normalizePhone = (phone: string | null | undefined): string | null => {
  if (!phone) return null
  const raw = String(phone).trim()
  if (!raw) return null

  // 1. Captura celular brasileiro quando há DDD explícito e nono dígito (com ou sem espaço/hífen)
  // Ex: "(11) 9 5386-9329", "11 9 5386-9329", "+55 (11) 9 5386-9329", "(11) 95386-9329", "11-9-5386-9329"
  const dddWithNineMatch = raw.match(
    /(?:(?:\+?55\s*)?(?:\(?([1-9]{2})\)?\s*))(?:\+?55\s*)?(?:9\s*|[9]?\s*)(\d{4,5})[\s.-]?(\d{4})/,
  )

  // 2. Captura específica quando o 9º dígito está isolado/separado por espaço ou hífen
  // Ex: "(11) 9 5386-9329", "11 9 5386-9329", "9 5386-9329", "9 53869329"
  const isolatedNineMatch = raw.match(
    /(?:(?:\+?55\s*)?(?:\(?([1-9]{2})\)?\s*))?9\s*(\d{4})[\s.-]?(\d{4})/,
  )
  if (isolatedNineMatch) {
    const ddd = isolatedNineMatch[1] || '11'
    return `${ddd}9${isolatedNineMatch[2]}${isolatedNineMatch[3]}`
  }

  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.substring(2)
  }

  // Se ficou com 10 dígitos (DDD + 8 dígitos) e for celular iniciando com [6-9], ou se o 9 inicial foi descartado
  // Nota: no Brasil (SP/DDD 11 e outros), celulares têm 9 dígitos começando com 9.
  // Se veio algo como 11 53869329 (10 dígitos cujo 3º dígito não é 9 mas é celular), ou 10 dígitos
  if (digits.length === 10) {
    const ddd = digits.substring(0, 2)
    const rest = digits.substring(2)
    // Se o resto começa com 6, 7, 8 ou 5 (celular antigo ou sem o 9 inicial)
    // Se o padrão original tinha "9" separado antes dos 8 dígitos, o regex acima já capturou.
    // Mas se o raw de alguma forma perdeu o 9 ou se foi extraído sem o 9 (ex: "1153869329"):
    // Se o número tem DDD e 8 dígitos que caracterizam celular (53869329), adiciona o 9 inicial
    if (raw.includes('9') && !rest.startsWith('9')) {
      return `${ddd}9${rest}`
    }
  }

  return digits || null
}
