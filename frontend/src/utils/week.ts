/**
 * Start date (Monday) of a week label such as "9/11 - 15/11" (day/month).
 * The year is the one that puts the date closest to `today`, so labels work
 * across New Year ("29/12 - 4/1").
 */
export function weekStartDate(weekLabel: string, today = new Date()): Date | null {
  const match = weekLabel.match(/(\d{1,2})\s*\/\s*(\d{1,2})/)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2]) - 1
  if (month < 0 || month > 11 || day < 1 || day > 31) return null

  const candidates = [-1, 0, 1].map((offset) => new Date(today.getFullYear() + offset, month, day))
  return candidates.reduce((best, date) =>
    Math.abs(date.getTime() - today.getTime()) < Math.abs(best.getTime() - today.getTime())
      ? date
      : best,
  )
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** "YYYY-MM-DD" (local date), the value format of `<input type="date">`. */
export const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

/** Local Date from "YYYY-MM-DD", or null. */
export function fromDateInput(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Monday of the week a "YYYY-MM-DD" date falls in (weeks run Monday → Sunday). "" if invalid. */
export function mondayOf(date: string): string {
  const d = fromDateInput(date)
  if (!d) return ''
  return toDateInput(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)))
}

/** A week's first day for the date picker: the saved date, else the one in its label. */
export function startDateOf(
  week: { startDate: string | null; weekLabel: string },
  today = new Date(),
): string {
  if (week.startDate) return week.startDate
  const start = weekStartDate(week.weekLabel, today)
  return start ? toDateInput(start) : ''
}

/** Label for the week starting on a date: "2026-11-16" → "16/11 - 22/11". "" if invalid. */
export function weekLabelFromStart(startDate: string): string {
  const start = fromDateInput(startDate)
  if (!start) return ''
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
  const dm = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`
  return `${dm(start)} - ${dm(end)}`
}

/**
 * Suggested first day for a new week: 7 days after the latest week's start (its date, or
 * the one in its label), or else next Monday.
 */
export function nextWeekStart(
  latest: { startDate: string | null; weekLabel: string } | undefined,
  today = new Date(),
): string {
  const start =
    (latest?.startDate && fromDateInput(latest.startDate)) ||
    (latest && weekStartDate(latest.weekLabel, today))
  if (start)
    return toDateInput(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7))
  const daysToMonday = (8 - today.getDay()) % 7 || 7
  return toDateInput(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysToMonday),
  )
}

/** Value for an `<input type="datetime-local">` (local time) from an ISO date-time, or "". */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** ISO date-time from an `<input type="datetime-local">` value (local time), or null if empty/invalid. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Calendar date ("10/11") for a weekday index (0 = Monday) in the given week, or "". */
export function slotDate(weekLabel: string, dayIndex: number, today = new Date()): string {
  if (dayIndex < 0 || dayIndex > 6) return ''
  const start = weekStartDate(weekLabel, today)
  if (!start) return ''
  const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + dayIndex)
  return `${date.getDate()}/${date.getMonth() + 1}`
}
