import { addDays, weekdayOf } from './time.js'

/** Matches the weekday prefix of a slot label: "Thứ 2 18h - 20h", "Chủ nhật 10h - 12h", "CN 9h - 11h". */
const DAY_PATTERN = /^\s*(?:thứ\s*([2-7])|(chủ\s*nhật|cn))(?:\s|$)/iu

/**
 * Weekday key of a slot label ("2" … "7", "cn"), or null when the label has no recognisable
 * day (admins may write free text). Mirrors parseSlot() in frontend/src/utils/slots.ts.
 */
export function slotDay(label: string): string | null {
  const match = label.match(DAY_PATTERN)
  if (!match) return null
  return match[1] ?? 'cn'
}

/** 0 = Monday … 6 = Sunday, or null when the label has no recognisable day. */
export function slotDayIndex(label: string): number | null {
  const day = slotDay(label)
  if (!day) return null
  return day === 'cn' ? 6 : Number(day) - 2
}

/**
 * Calendar date ("YYYY-MM-DD") a slot such as "Thứ 2 18h - 20h" falls on in the week starting
 * on `startDate`, or null when the label has no recognisable day.
 */
export function slotDate(startDate: string, slot: string): string | null {
  const day = slotDayIndex(slot)
  if (day === null) return null
  return addDays(startDate, (day - weekdayOf(startDate) + 7) % 7)
}

const TIME_PATTERN = /(\d{1,2})\s*(?:[h:]\s*(\d{2})?)?\s*[-–—]\s*(\d{1,2})\s*(?:[h:]\s*(\d{2})?)?/u

/**
 * Start and end of a slot in minutes after midnight: "Thứ 2 18h - 20h" → 1080–1200,
 * "Thứ 7 9h30 - 11h" → 570–660. Null when the label has no time range. Mirrors the time
 * part of parseSlot() in frontend/src/utils/slots.ts.
 */
export function slotTime(label: string): { start: number; end: number } | null {
  const match = label.replace(DAY_PATTERN, ' ').match(TIME_PATTERN)
  if (!match) return null
  const [, sh, sm, eh, em] = match
  const start = Number(sh) * 60 + Number(sm ?? 0)
  let end = Number(eh) * 60 + Number(em ?? 0)
  if (start >= 24 * 60 || end > 24 * 60) return null
  if (end <= start) end += 24 * 60 // e.g. "22h - 0h"
  return { start, end }
}

/** Human-readable day of a key returned by slotDay(): "Thứ 2" … "Chủ nhật". */
export const dayLabel = (day: string) => (day === 'cn' ? 'Chủ nhật' : `Thứ ${day}`)

/** The first weekday used by more than one of the slots, or null. Unparseable labels never clash. */
export function findSameDay(slots: readonly string[]): string | null {
  const seen = new Set<string>()
  for (const slot of slots) {
    const day = slotDay(slot)
    if (!day) continue
    if (seen.has(day)) return day
    seen.add(day)
  }
  return null
}
