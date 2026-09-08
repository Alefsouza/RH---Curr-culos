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

    const brMatch = dStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
    if (brMatch) {
      const day = parseInt(brMatch[1], 10)
      const month = parseInt(brMatch[2], 10) - 1
      const year = parseInt(brMatch[3], 10)
      const parsed = new Date(year, month, day)
      if (!isNaN(parsed.getTime()) && parsed.getMonth() === month && parsed.getDate() === day) {
        birthDate = parsed
      }
    } else {
      const isoMatch = dStr.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
      if (isoMatch) {
        const year = parseInt(isoMatch[1], 10)
        const month = parseInt(isoMatch[2], 10) - 1
        const day = parseInt(isoMatch[3], 10)
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
