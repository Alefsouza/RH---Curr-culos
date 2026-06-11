export const normalizePhone = (phone: string | null | undefined): string | null => {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.substring(2)
  }
  return digits || null
}
