export const normalizePhone = (phone: string | null | undefined): string | null => {
  if (!phone) return null
  const raw = String(phone).trim()
  if (!raw) return null

  // Captura celular brasileiro com nono dígito isolado/separado por espaço ou hífen
  // Ex: "(11) 9 5386-9329", "11 9 5386-9329", "11-9-5386-9329", "(11) 9-5386-9329"
  // Monta DDD + 9 + 8 dígitos = 11 dígitos
  const isolatedNineMatch = raw.match(/(?:(?:\+?55\s*)?(?:\(?([1-9]{2})\)?\s*))?9\s*(\d{4})[\s.-]?(\d{4})/)
  if (isolatedNineMatch) {
    const ddd = isolatedNineMatch[1] || '11'
    return `${ddd}9${isolatedNineMatch[2]}${isolatedNineMatch[3]}`
  }

  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.substring(2)
  }
  return digits || null
}
