import { t } from '@/i18n'
import { dayName, timeRange } from '@/i18n/format'
import type { Member } from '@/types/booking'
import { mergeSlots } from '@/utils/slots'
import { dayMonth, weekDayDate } from '@/utils/week'
import type { CellValue, Sheet, SheetColumn } from '@/utils/xlsx'

/** Share of marked sessions attended, or null when nothing was marked yet. */
export const attendanceRate = (m: Pick<Member, 'attended' | 'absent'>) =>
  m.attended + m.absent ? m.attended / (m.attended + m.absent) : null

/** 0.834 → "83%"; null (nothing to measure) → "—". */
export const formatPercent = (value: number | null) =>
  value === null ? '—' : `${Math.round(value * 100)}%`

/**
 * The members dashboard as a spreadsheet: one row per student (those booked in the week
 * first, each group in `compare` order), a column per day of the week someone booked with
 * the times they come, then their totals over all weeks. As on the page: names, plus the
 * phone/email only when an admin has them shown (members carry `contact`); never notes.
 */
export function membersSheet(
  members: readonly Member[],
  week: { weekLabel: string; startDate: string | null },
  compare: (a: Member, b: Member) => number,
  today = new Date(),
): Sheet {
  const booked = new Map(members.map((m) => [m, mergeSlots(m.week?.slots ?? [])]))

  // Days anyone booked, Mon → Sun (unreadable labels last), each with a slot for its name.
  const days = new Map<number, Parameters<typeof dayName>[0]>()
  for (const slots of booked.values()) {
    for (const slot of slots) if (!days.has(slot.dayIndex)) days.set(slot.dayIndex, slot)
  }
  const dayColumns = [...days].sort(([a], [b]) => a - b)
  const withContact = members.some((m) => m.contact)

  const columns: SheetColumn[] = [
    { header: t('common.zaloName'), width: 28 },
    ...(withContact ? [{ header: t('members.export.contact'), width: 26 }] : []),
    ...dayColumns.map(([dayIndex, slot]): SheetColumn => {
      const date = weekDayDate(week, dayIndex, today)
      return {
        header: [dayName(slot), date && dayMonth(date)].filter(Boolean).join(' '),
        width: 18,
      }
    }),
    { header: t('members.export.weekSessions'), width: 16 },
    { header: t('members.export.weeks'), width: 16 },
    { header: t('members.export.sessions'), width: 16 },
    { header: t('members.export.attended'), width: 14 },
    { header: t('members.export.absent'), width: 14 },
    { header: t('members.colAttendance'), width: 14, format: 'percent' },
    { header: t('members.export.lastWeek'), width: 20 },
  ]

  const ordered = [
    ...members.filter((m) => m.week).sort(compare),
    ...members.filter((m) => !m.week).sort(compare),
  ]
  const rows = ordered.map((m): CellValue[] => {
    const slots = booked.get(m) ?? []
    return [
      m.zaloName,
      ...(withContact ? [m.contact ?? ''] : []),
      ...dayColumns.map(([dayIndex]) =>
        slots
          .filter((s) => s.dayIndex === dayIndex)
          .map(timeRange)
          .join(', '),
      ),
      m.week?.count ?? 0,
      m.weeks,
      m.sessions,
      m.attended,
      m.absent,
      attendanceRate(m),
      m.lastWeekLabel,
    ]
  })

  return { name: t('common.week', { week: week.weekLabel }), columns, rows }
}

/** "hoc-vien-16_11_-_22_11.xlsx" */
export const membersFileName = (weekLabel: string) =>
  `hoc-vien-${weekLabel.replace(/[^\w-]+/g, '_')}.xlsx`
