import type { Slot } from '@/types/booking'
import { currentLocale, intlLocale, t } from './index'

/**
 * Display helpers. Slot labels are stored in Vietnamese ("Thứ 2 18h - 20h"); these turn the
 * parsed parts into the current language at render time.
 */

/** Day name for a parsed slot: "Thứ 2" / "Monday" (short: "T2" / "Mon"). */
export function dayName(slot: Pick<Slot, 'dayIndex' | 'day'>, variant: 'long' | 'short' = 'long') {
  if (slot.dayIndex < 0 || slot.dayIndex > 6) return t('days.other')
  return t(`days.${variant}.${slot.dayIndex}`)
}

function hourLabel(hour: number) {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  if (currentLocale() === 'en') return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

/** Time range: "18h – 20h" / "18:00 – 20:00". Unparsed labels are shown as written. */
export function timeRange(slot: Pick<Slot, 'start' | 'end' | 'time'>) {
  if (slot.start === null || slot.end === null) return slot.time
  return `${hourLabel(slot.start)} – ${hourLabel(slot.end)}`
}

/** "T2 · 18h – 20h" / "Mon · 18:00 – 20:00" */
export const slotShort = (slot: Slot) => `${dayName(slot, 'short')} · ${timeRange(slot)}`

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(intlLocale(), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(intlLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

export const formatTime = (date: Date) =>
  date.toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' })
