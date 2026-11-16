import { t } from '@/i18n'
import type { ScheduleConfig, SessionCount } from '@/types/booking'
import { normalizeContact } from './contact'
import { parseSlot, sessionSlots } from './slots'

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

/** Date rules for the slots, from the schedule store. */
export interface SlotRules {
  /** Weekdays (0 = Monday) of the booking week that are over: their slots can't be picked. */
  pastDays?: ReadonlySet<number>
  /** Slots of the saved booking being changed: they may stay even once their day is over. */
  kept?: readonly string[]
}

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
  config: Pick<ScheduleConfig, 'slots1' | 'slots2' | 'slots3'> | null,
  { pastDays, kept = [] }: SlotRules = {},
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

  const offered = config ? sessionSlots(config) : null
  const seen = new Set<string>()
  /** Weekday index → 1-based session already on that day. */
  const days = new Map<number, number>()
  for (let i = 0; i < draft.count; i++) {
    const key = `slot${i}` as 'slot0' | 'slot1' | 'slot2'
    const slot = draft.slots[i] ?? ''
    const allowed = offered?.[i]
    const dayIndex = slot ? parseSlot(slot).dayIndex : 7

    if (!slot) errors[key] = t('validation.slotRequired', { n: i + 1 })
    else if (allowed && !allowed.includes(slot))
      errors[key] = t('validation.slotNotInSchedule', { slot, n: i + 1 })
    // A day that is over can't be booked any more (e.g. Monday, on Tuesday).
    else if (pastDays?.has(dayIndex) && !kept.includes(slot))
      errors[key] = t('validation.slotPast', { slot })
    else if (seen.has(slot)) errors[key] = t('validation.slotDuplicate')
    // With 2+ sessions each must be on a different day (free-text slots can't be checked).
    else if (days.has(dayIndex))
      errors[key] = t('validation.slotSameDay', { n: days.get(dayIndex)! })

    seen.add(slot)
    if (slot && dayIndex < 7 && !days.has(dayIndex)) days.set(dayIndex, i + 1)
  }

  return errors
}
