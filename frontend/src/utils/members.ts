import type { Member } from '@/types/booking'

/** Share of marked sessions attended, or null when nothing was marked yet. */
export const attendanceRate = (m: Pick<Member, 'attended' | 'absent'>) =>
  m.attended + m.absent ? m.attended / (m.attended + m.absent) : null

/** 0.834 → "83%"; null (nothing to measure) → "—". */
export const formatPercent = (value: number | null) =>
  value === null ? '—' : `${Math.round(value * 100)}%`
