import type { DayGroup, DayPeriod, Slot } from '@/types/booking'

const DAY_PATTERN = /^(?:thứ\s*([2-7])|(chủ\s*nhật|cn))\s+(.+)$/iu
const TIME_PATTERN = /(\d{1,2})\s*(?:[h:]\s*(\d{2})?)?\s*[-–—]\s*(\d{1,2})\s*(?:[h:]\s*(\d{2})?)?/iu

/**
 * 18 → "18h", 18.5 → "18h30". Used for `slot.time`, a stable key; display text comes from
 * `timeRange()` in i18n/format.ts, which follows the current language.
 */
export function formatHour(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

function toHour(hours: string, minutes?: string): number {
  return Number(hours) + (minutes ? Number(minutes) / 60 : 0)
}

export function periodOf(startHour: number): DayPeriod {
  if (startHour < 12) return 'morning'
  if (startHour < 17) return 'afternoon'
  return 'evening'
}

/**
 * Parses a slot label such as "Thứ 2 18h - 20h" or "Chủ nhật 10h - 12h" (labels are written
 * in Vietnamese by the admin). Unknown formats are kept intact (day "Khác", index 7) so admins
 * can use free text. Translate for display with dayName()/timeRange() from i18n/format.ts.
 */
export function parseSlot(label: string): Slot {
  const value = label.trim()
  const dayMatch = value.match(DAY_PATTERN)

  let day = 'Khác'
  let dayShort = '•'
  let dayIndex = 7
  let rawTime = value

  if (dayMatch) {
    const [, weekday, sunday, rest = ''] = dayMatch
    rawTime = rest.trim()
    if (weekday) {
      day = `Thứ ${weekday}`
      dayShort = `T${weekday}`
      dayIndex = Number(weekday) - 2
    } else if (sunday) {
      day = 'Chủ nhật'
      dayShort = 'CN'
      dayIndex = 6
    }
  }

  const timeMatch = rawTime.match(TIME_PATTERN)
  if (!timeMatch) {
    return { value, day, dayShort, dayIndex, time: rawTime, start: null, end: null, period: null }
  }

  const [, sh = '0', sm, eh = '0', em] = timeMatch
  const start = toHour(sh, sm)
  const end = toHour(eh, em)

  return {
    value,
    day,
    dayShort,
    dayIndex,
    time: `${formatHour(start)} – ${formatHour(end)}`,
    start,
    end,
    period: periodOf(start),
  }
}

/** Groups slot labels by weekday (Mon → Sun), each day sorted by start time. */
export function groupByDay(labels: readonly string[]): DayGroup[] {
  const groups = new Map<string, DayGroup>()

  for (const label of labels) {
    if (!label.trim()) continue
    const slot = parseSlot(label)
    let group = groups.get(slot.day)
    if (!group) {
      group = { day: slot.day, dayShort: slot.dayShort, dayIndex: slot.dayIndex, slots: [] }
      groups.set(slot.day, group)
    }
    if (!group.slots.some((s) => s.value === slot.value)) group.slots.push(slot)
  }

  return [...groups.values()]
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map((g) => ({ ...g, slots: g.slots.sort((a, b) => (a.start ?? 99) - (b.start ?? 99)) }))
}

/** Unique, chronologically sorted slots across several label lists. */
export function mergeSlots(...lists: readonly (readonly string[])[]): Slot[] {
  return groupByDay(lists.flat()).flatMap((g) => g.slots)
}
