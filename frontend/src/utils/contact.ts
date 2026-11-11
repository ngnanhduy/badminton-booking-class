export type ContactKind = 'phone' | 'email'

export interface NormalizedContact {
  kind: ContactKind
  value: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Normalizes a phone number or email so the same contact always matches.
 * Must stay in sync with `normalizeContact_` in apps-script/Code.gs.
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

  if (/^0\d{9}$/.test(digits) || /^\+\d{8,15}$/.test(digits))
    return { kind: 'phone', value: digits }
  return null
}

/** Partially hides a contact for display: "0912345678" → "091•••••78". */
export function maskContact(raw: string): string {
  const contact = normalizeContact(raw)
  if (!contact) return raw.trim()
  if (contact.kind === 'email') {
    const [user = '', domain = ''] = contact.value.split('@')
    return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, user.length - 2))}@${domain}`
  }
  const v = contact.value
  return `${v.slice(0, 3)}${'•'.repeat(Math.max(1, v.length - 5))}${v.slice(-2)}`
}
