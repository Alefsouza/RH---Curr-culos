/* General utility functions (exposes cn) */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges multiple class names into a single string
 * @param inputs - Array of class names
 * @returns Merged class names
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalizes a phone number by keeping only digits and removing the
 * leading '55' country code if the resulting number has 12 or more digits.
 */
export function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return ''
  let cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('55') && cleaned.length > 11) {
    cleaned = cleaned.substring(2)
  }
  return cleaned
}

/**
 * Safely converts any value (string, number, object, array) into a
 * render-safe string. Objects with common resume keys like `cargo`,
 * `empresa`, and `periodo` are joined into a readable string so they
 * are never passed directly as React children.
 */
export function safeText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value
      .map((v) => safeText(v))
      .filter(Boolean)
      .join(' • ')
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const priorityKeys = [
      'cargo',
      'empresa',
      'periodo',
      'titulo',
      'instituicao',
      'grau',
      'nome',
      'descricao',
      'texto',
    ]
    const parts: string[] = []
    for (const key of priorityKeys) {
      if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
        parts.push(safeText(obj[key]))
      }
    }
    if (parts.length > 0) return parts.join(' — ')
    const remaining = Object.values(obj).filter((v) => v !== null && v !== undefined && v !== '')
    if (remaining.length > 0) return remaining.map((v) => safeText(v)).join(' — ')
    return ''
  }
  return String(value)
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
export function extractBirthDateFromString(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null
  const clean = input.trim()
  if (!clean) return null

  // 1. Procura formatos numéricos: DD/MM/AAAA, DD-MM-AAAA, DD.MM.AAAA
  const dmyMatch = clean.match(/\b([0-3]?\d)[/\-.]([0-1]?\d)[/\-.]((?:19|20)\d{2})\b/)
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
  const ymdMatch = clean.match(/\b((?:19|20)\d{2})[/\-.]([0-1]?\d)[/\-.]([0-3]?\d)\b/)
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

export function calculateAgeFromBirthDate(
  birthDateInput: string | Date | null | undefined,
  referenceDate: Date = new Date(),
): number | null {
  if (!birthDateInput) return null

  let birthDate: Date | null = null

  if (birthDateInput instanceof Date) {
    if (!isNaN(birthDateInput.getTime())) {
      birthDate = birthDateInput
    }
  } else if (typeof birthDateInput === 'string') {
    const dStr = birthDateInput.trim()
    if (!dStr) return null

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
 * Prioridade: se houver data de nascimento válida, calcula com base na data atual.
 * Caso contrário, se houver idade numérica solta, retorna-a.
 */
export function resolveCandidateAge(
  rawIdade: any,
  dataNascimento: string | null | undefined,
): number | null {
  const calculated = calculateAgeFromBirthDate(dataNascimento)
  if (calculated !== null) {
    return calculated
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
