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
