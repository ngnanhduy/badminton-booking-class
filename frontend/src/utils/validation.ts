import { t } from '@/i18n'
import type { ScheduleConfig, SessionCount } from '@/types/booking'
import { normalizeContact } from './contact'

export interface BookingDraft {
  zaloName: string
  contact: string
  count: SessionCount | null
  slots: string[]
  /** Explicit consent to personal data processing. Undefined = not checked by this caller. */
  consent?: boolean
}

export type BookingErrors = Partial<
  Record<'zaloName' | 'contact' | 'count' | 'slot0' | 'slot1' | 'slot2' | 'consent', string>
>

export const MAX_NAME_LENGTH = 100
export const MAX_MAKEUP_LENGTH = 300

export function contactError(contact: string): string | undefined {
  if (!contact.trim()) return t('validation.contactRequired')
  if (!normalizeContact(contact)) return t('validation.contactInvalid')
  return undefined
}

/**
 * Client-side validation, in the current language (call it from a computed so messages
 * follow language changes). The backend re-validates everything.
 */
export function validateBooking(
  draft: BookingDraft,
  config: Pick<ScheduleConfig, 'slots1' | 'slots2'> | null,
): BookingErrors {
  const errors: BookingErrors = {}
  const name = draft.zaloName.trim()

  if (!name) errors.zaloName = t('validation.nameRequired')
  else if (name.length > MAX_NAME_LENGTH)
    errors.zaloName = t('validation.nameTooLong', { max: MAX_NAME_LENGTH })

  const contact = contactError(draft.contact)
  if (contact) errors.contact = contact

  if (draft.consent === false) errors.consent = t('validation.consentRequired')

  if (!draft.count) {
    errors.count = t('validation.countRequired')
    return errors
  }

  const seen = new Set<string>()
  for (let i = 0; i < draft.count; i++) {
    const key = `slot${i}` as 'slot0' | 'slot1' | 'slot2'
    const slot = draft.slots[i] ?? ''
    const allowed = i === 0 ? config?.slots1 : config?.slots2

    if (!slot) errors[key] = t('validation.slotRequired', { n: i + 1 })
    else if (allowed && !allowed.includes(slot))
      errors[key] = t('validation.slotNotInSchedule', { slot, n: i + 1 })
    else if (seen.has(slot)) errors[key] = t('validation.slotDuplicate')

    seen.add(slot)
  }

  return errors
}
