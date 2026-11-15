/**
 * Calendar helpers. Dates are plain "YYYY-MM-DD" strings in the class time zone (see
 * CLASS_TIMEZONE), so day arithmetic never depends on the server's own time zone.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string) {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    formatters.set(timeZone, f)
  }
  return f
}

export function isValidTimeZone(timeZone: string) {
  try {
    formatter(timeZone)
    return true
  } catch {
    return false
  }
}

/** Local date and minutes after midnight of `now` in a time zone. */
export function localTime(now: Date, timeZone: string): { date: string; minutes: number } {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(now).map((p) => [p.type, p.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

const utc = (date: string) => Date.parse(`${date}T00:00:00Z`)

export const addDays = (date: string, days: number) =>
  new Date(utc(date) + days * DAY_MS).toISOString().slice(0, 10)

export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY_MS)

/** 0 = Monday … 6 = Sunday. */
export const weekdayOf = (date: string) => (new Date(utc(date)).getUTCDay() + 6) % 7

export const mondayOf = (date: string) => addDays(date, -weekdayOf(date))

/** "2026-11-16" → "16/11 - 22/11" (the label format admins use). */
export function weekLabelFor(startDate: string) {
  const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`
  return `${dm(startDate)} - ${dm(addDays(startDate, 6))}`
}

/**
 * First date written in a label such as "9/11 - 15/11" (day/month), in the year that puts
 * it closest to `today`, so labels work across New Year. Null if there is no valid date.
 * Mirrors weekStartDate() in frontend/src/utils/week.ts.
 */
export function startDateFromLabel(label: string, today: string): string | null {
  const match = label.match(/(\d{1,2})\s*\/\s*(\d{1,2})/)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(today.slice(0, 4))
  const candidates = [year - 1, year, year + 1]
    .map((y) => `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
    .filter((d) => !Number.isNaN(utc(d)) && new Date(utc(d)).getUTCDate() === day)
  if (!candidates.length) return null
  return candidates.reduce((best, d) =>
    Math.abs(daysBetween(today, d)) < Math.abs(daysBetween(today, best)) ? d : best,
  )
}

/** "18:30" from minutes after midnight. */
export const clockTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
