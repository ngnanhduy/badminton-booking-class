export type ContactKind = 'phone' | 'email'

export interface NormalizedContact {
  kind: ContactKind
  value: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Normalizes a phone number or email so the same contact always produces the same
 * blind index. Keep in sync with frontend/src/utils/contact.ts (tests cover both).
 *
 * "+84 912.345.678" → "0912345678", " An@Gmail.com " → "an@gmail.com"
 */
export function normalizeContact(raw: string): NormalizedContact | null {
  const value = raw.trim()
  if (!value) return null

  if (value.includes('@')) {
    const email = value.toLowerCase()
    return email.length <= 254 && EMAIL_PATTERN.test(email) ? { kind: 'email', value: email } : null
  }

  let digits = value.replace(/[\s.\-()]/g, '')
  if (digits.startsWith('+84')) digits = `0${digits.slice(3)}`
  else if (digits.startsWith('84') && digits.length === 11) digits = `0${digits.slice(2)}`

  if (/^0\d{9}$/.test(digits) || /^\+\d{8,15}$/.test(digits)) return { kind: 'phone', value: digits }
  return null
}

/** Case/whitespace-insensitive form of a Zalo name, used for the name blind index. */
export function normalizeName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi')
}
