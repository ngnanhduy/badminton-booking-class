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
