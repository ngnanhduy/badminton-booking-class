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

/** Calendar date ("10/11") for a weekday index (0 = Monday) in the given week, or "". */
export function slotDate(weekLabel: string, dayIndex: number, today = new Date()): string {
  if (dayIndex < 0 || dayIndex > 6) return ''
  const start = weekStartDate(weekLabel, today)
  if (!start) return ''
  const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + dayIndex)
  return `${date.getDate()}/${date.getMonth() + 1}`
}
