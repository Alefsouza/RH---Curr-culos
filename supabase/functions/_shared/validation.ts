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

/**
 * Normaliza uma string para comparação fonética/textual estrita:
 * minúsculas, sem acentos, sem pontuações desnecessárias, espaços únicos.
 */
export const normalizeCandidateName = (name: string | null | undefined): string => {
  if (!name || typeof name !== 'string') return ''
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

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

  // Se é só caracteres especiais ou não tem letras
  if (!/[a-zA-ZÀ-ÿ]/.test(trimmed)) return null

  // Um nome de pessoa válido NÃO pode conter dígitos (rejeita "1h6kms", "87afhn", "1788206596330", etc.)
  if (/\d/.test(trimmed)) return null

  // Rejeita padrões alfanuméricos curtos tipo hash / ids (ex: "1h6kms", "tvw8ns", "87afhn", etc.)
  if (/^[a-z0-9]{4,12}$/i.test(trimmed.replace(/\s+/g, ''))) return null

  // Rejeita strings com termos conhecidos de hash ou arquivo
  if (/^(tvw8ns|1h6kms|87afhn|blob|upload|file|temp)$/i.test(trimmed)) return null

  return trimmed
}

/**
 * Calcula a idade em anos completos a partir de uma data de nascimento ou string de data.
 * Suporta formatos:
 * - "DD/MM/YYYY" ou "DD-MM-YYYY"
 * - "YYYY-MM-DD" ou "YYYY/MM/DD"
 * - ISO string
 */
const MONTH_NAMES_MAP: Record<string, number> = {
  janeiro: 0,
  jan: 0,
  fevereiro: 1,
  fev: 1,
  marco: 2,
  mar: 2,
  abril: 3,
  abr: 3,
  maio: 4,
  mai: 4,
  junho: 5,
  jun: 5,
  julho: 6,
  jul: 6,
  agosto: 7,
  ago: 7,
  setembro: 8,
  set: 8,
  outubro: 9,
  out: 9,
  novembro: 10,
  nov: 10,
  dezembro: 11,
  dez: 11,
}

/**
 * Tenta extrair e normalizar uma data de nascimento a partir de uma string livre
 * (suporta DD/MM/AAAA, DD-MM-AAAA, DD.MM.AAAA, ISO AAAA-MM-DD, e frases como "nascido em 12/03/1990", "nascimento: 15 de maio de 1985").
 */
export const extractBirthDateFromString = (input: string | null | undefined): string | null => {
  if (!input || typeof input !== 'string') return null
  const clean = input.trim()
  if (!clean) return null

  // 1. Procura formatos numéricos: DD/MM/AAAA, DD-MM-AAAA, DD.MM.AAAA
  const dmyMatch = clean.match(/\b([0-3]?\d)[\/\-\.]([0-1]?\d)[\/\-\.]((?:19|20)\d{2})\b/)
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0')
    const month = dmyMatch[2].padStart(2, '0')
    const year = dmyMatch[3]
    const dNum = parseInt(day, 10)
    const mNum = parseInt(month, 10)
    if (dNum >= 1 && dNum <= 31 && mNum >= 1 && mNum <= 12) {
      return `${day}/${month}/${year}`
    }
  }

  // 2. Formato ISO AAAA-MM-DD ou AAAA/MM/DD ou AAAA.MM.DD
  const ymdMatch = clean.match(/\b((?:19|20)\d{2})[\/\-\.]([0-1]?\d)[\/\-\.]([0-3]?\d)\b/)
  if (ymdMatch) {
    const year = ymdMatch[1]
    const month = ymdMatch[2].padStart(2, '0')
    const day = ymdMatch[3].padStart(2, '0')
    const dNum = parseInt(day, 10)
    const mNum = parseInt(month, 10)
    if (dNum >= 1 && dNum <= 31 && mNum >= 1 && mNum <= 12) {
      return `${day}/${month}/${year}`
    }
  }

  // 3. Formato textual brasileiro: "15 de maio de 1985", "nascido a 10 de marco de 1992"
  const normText = clean
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const textualMatch = normText.match(/\b([0-3]?\d)\s+de\s+([a-z]+)\s+de\s+((?:19|20)\d{2})\b/)
  if (textualMatch) {
    const day = textualMatch[1].padStart(2, '0')
    const monthStr = textualMatch[2]
    const year = textualMatch[3]
    if (MONTH_NAMES_MAP[monthStr] !== undefined) {
      const month = String(MONTH_NAMES_MAP[monthStr] + 1).padStart(2, '0')
      return `${day}/${month}/${year}`
    }
  }

  return null
}

/**
 * Calcula a idade em anos completos a partir de uma data de nascimento ou string de data.
 * Suporta formatos:
 * - "DD/MM/YYYY", "DD-MM-YYYY", "DD.MM.YYYY"
 * - "YYYY-MM-DD", "YYYY/MM/DD", "YYYY.MM.DD"
 * - Frases: "nascido em 12/03/1990", "15 de maio de 1985"
 * - ISO string
 */
export const calculateAgeFromBirthDate = (
  birthDateInput: string | Date | null | undefined,
  referenceDate: Date = new Date(),
): number | null => {
  if (!birthDateInput) return null

  let birthDate: Date | null = null

  if (birthDateInput instanceof Date) {
    if (!isNaN(birthDateInput.getTime())) {
      birthDate = birthDateInput
    }
  } else if (typeof birthDateInput === 'string') {
    const dStr = birthDateInput.trim()
    if (!dStr) return null

    // Extrai no formato padronizado DD/MM/AAAA
    const extractedFormatted = extractBirthDateFromString(dStr)
    if (extractedFormatted) {
      const parts = extractedFormatted.split('/')
      const day = parseInt(parts[0], 10)
      const month = parseInt(parts[1], 10) - 1
      const year = parseInt(parts[2], 10)
      const parsed = new Date(year, month, day)
      if (!isNaN(parsed.getTime()) && parsed.getMonth() === month && parsed.getDate() === day) {
        birthDate = parsed
      }
    } else {
      const parsed = new Date(dStr)
      if (!isNaN(parsed.getTime())) {
        birthDate = parsed
      }
    }
  }

  if (!birthDate || isNaN(birthDate.getTime())) {
    return null
  }

  let age = referenceDate.getFullYear() - birthDate.getFullYear()
  const m = referenceDate.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && referenceDate.getDate() < birthDate.getDate())) {
    age--
  }

  if (age >= 0 && age < 130) {
    return age
  }

  return null
}

/**
 * Normaliza e resolve a idade do candidato:
 * Prioridade: se houver data de nascimento válida, a idade DEVE ser calculada a partir dela
 * (com a data atual), em vez de usar o campo "idade" solto.
 * Caso não haja data de nascimento, usa o valor de idade original se for numérico válido.
 */
export const resolveCandidateAge = (
  rawIdade: any,
  dataNascimento: string | null | undefined,
): number | null => {
  const calculatedFromBirth = calculateAgeFromBirthDate(dataNascimento)
  if (calculatedFromBirth !== null) {
    return calculatedFromBirth
  }

  if (typeof rawIdade === 'number' && !isNaN(rawIdade) && rawIdade > 0 && rawIdade < 130) {
    return Math.floor(rawIdade)
  }

  if (typeof rawIdade === 'string') {
    const match = rawIdade.match(/\d+/)
    if (match) {
      const parsed = parseInt(match[0], 10)
      if (!isNaN(parsed) && parsed > 0 && parsed < 130) {
        return parsed
      }
    }
  }

  return null
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
