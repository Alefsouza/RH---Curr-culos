export const normalizePhone = (phone: string | null | undefined): string | null => {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.substring(2)
  }
  return digits || null
}

const INVALID_PHONE_PATTERNS = [
  /^(\d)\1{9,10}$/, // 11111111111, 99999999999, 00000000000
  /^(11)?999999999$/, // 11999999999 ou 999999999
  /^(11)?000000000$/,
  /^(11)?123456789$/,
  /^1234567890$/,
]

export const isValidBrazilianPhone = (phone: string | null | undefined): boolean => {
  if (!phone) return false
  const digits = normalizePhone(phone)
  if (!digits) return false
  // Deve ter 10 ou 11 dígitos (DDD + 8 ou 9 dígitos)
  if (digits.length !== 10 && digits.length !== 11) return false

  // DDD válido no Brasil (11 a 99)
  const ddd = parseInt(digits.substring(0, 2), 10)
  if (ddd < 11 || ddd > 99) return false

  // Se tem 11 dígitos, celular começa com 9 (3º dígito = 9)
  if (digits.length === 11 && digits[2] !== '9') return false

  for (const pattern of INVALID_PHONE_PATTERNS) {
    if (pattern.test(digits)) return false
  }

  return true
}

const INVALID_NAME_PATTERNS = [
  /^(candidato\s+desconhecido|desconhecido|desconhecida|sem\s+nome|nome\s+completo\s+exemplo|nome\s+do\s+candidato|nome\s+completo|nome\s+candidato|candidato|candidata)$/i,
  /^(jo[aã]o\s+da\s+silva|fulano\s+de\s+tal|jo[aã]o\s+silva|maria\s+da\s+silva)$/i,
  /^(string\s+ou\s+null|string|null|undefined|none|n\/a|nao\s+informado|não\s+informado|nome\s+n[aã]o\s+identificado|n[aã]o\s+identificado)$/i,
  /^curr[ií]culo(\s+vitae)?$/i,
  /.*candidato\s+desconhecido.*/i,
  /.*nome\s+completo\s+exemplo.*/i,
  /.*string\s+ou\s+null.*/i,
  /.*nome\s+n[aã]o\s+identificado.*/i,
]

export const sanitizeAndValidateName = (name: string | null | undefined): string | null => {
  if (!name || typeof name !== 'string') return null
  let trimmed = name.trim().replace(/\s+/g, ' ')
  if (!trimmed || trimmed.length < 2) return null

  for (const pattern of INVALID_NAME_PATTERNS) {
    if (pattern.test(trimmed)) return null
  }

  // Remove repetições do tipo "Lucas Lucas", "Lucas Lucas de Miranda", "Silva Silva" no início
  const words = trimmed.split(' ')
  if (words.length >= 2 && words[0].toLowerCase() === words[1].toLowerCase()) {
    words.shift() // Remove a primeira palavra duplicada
    trimmed = words.join(' ')
  }

  // Se o nome virou apenas uma única palavra muito curta ou inválida
  if (trimmed.length < 2) return null

  // Se é só números ou caracteres especiais
  if (!/[a-zA-ZÀ-ÿ]/.test(trimmed)) return null

  return trimmed
}

const INVALID_EMAIL_DOMAINS = [
  'example.com',
  'example.org',
  'example.net',
  'email.com',
  'seuemail.com',
  'seunome.com',
  'teste.com',
  'test.com',
  'dominio.com',
  'mail.com',
]

export const sanitizeAndValidateEmail = (email: string | null | undefined): string | null => {
  if (!email || typeof email !== 'string') return null
  const trimmed = email.trim().toLowerCase()
  if (!trimmed || !trimmed.includes('@')) return null

  if (
    trimmed === 'null' ||
    trimmed === 'undefined' ||
    trimmed === 'string ou null' ||
    trimmed === 'string'
  ) {
    return null
  }

  const parts = trimmed.split('@')
  if (parts.length !== 2) return null
  const [local, domain] = parts
  if (!local || !domain) return null

  if (INVALID_EMAIL_DOMAINS.includes(domain)) return null
  if (local === 'exemplo' || local === 'nome' || local === 'user' || local === 'usuario')
    return null

  // Regex de e-mail básico
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(trimmed)) return null

  return trimmed
}
