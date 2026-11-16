import { and, eq } from 'drizzle-orm'

import { attendance, bookings, weeks, type BookingRow } from '../../db/schema.js'
import { conflict, notFound } from '../../lib/errors.js'
import { slotDate, slotTime } from '../../lib/slots.js'
import { clockTime, daysBetween, localTime, startDateFromLabel } from '../../lib/time.js'
import type { AppDeps } from '../../types.js'
import { audit } from '../audit/audit.service.js'
import { contactIndex, decryptName } from '../bookings/booking.service.js'

/** `attendance.updatedBy` for marks students made themselves. */
export const SELF_CHECKIN = 'self'

export interface CheckInResult {
  zaloName: string
  weekLabel: string
  slot: string
  /** True when this session was already marked present (nothing changed). */
  alreadyCheckedIn: boolean
}

interface TodaySession {
  booking: BookingRow
  slot: string
  start: number
  end: number
}

/**
 * A student marks themselves present with their phone/email. Allowed only for a session
 * they booked for today, from CHECKIN_EARLY_MINUTES before it starts until it ends (class
 * time zone), so the attendance list still matches the bookings.
 */
export async function selfCheckIn(deps: AppDeps, rawContact: string, now = new Date()): Promise<CheckInResult> {
  const { db, keyring, config } = deps
  const hash = contactIndex(keyring, rawContact)
  const today = localTime(now, config.CLASS_TIMEZONE)

  const rows = await db
    .select({ booking: bookings, startDate: weeks.startDate })
    .from(bookings)
    .innerJoin(weeks, eq(weeks.label, bookings.weekLabel))
    .where(eq(bookings.contactHash, hash))

  const sessions: TodaySession[] = []
  for (const { booking, startDate } of rows) {
    const start = startDate ?? startDateFromLabel(booking.weekLabel, today.date)
    if (!start) continue
    const offset = daysBetween(start, today.date)
    if (offset < 0 || offset > 6) continue
    const booked = [booking.slot1, booking.slot2, booking.slot3].slice(0, booking.sessionCount)
    for (const slot of booked) {
      if (!slot || slotDate(start, slot) !== today.date) continue
      const time = slotTime(slot)
      if (time) sessions.push({ booking, slot, ...time })
    }
  }
  if (!sessions.length) {
    throw notFound('CHECKIN_NO_CLASS_TODAY', 'Hôm nay bạn không có ca học nào đã đăng ký.')
  }

  const early = config.CHECKIN_EARLY_MINUTES
  const session = sessions.find((s) => today.minutes >= s.start - early && today.minutes <= s.end)
  if (!session) {
    const next = sessions
      .filter((s) => today.minutes < s.start - early)
      .sort((a, b) => a.start - b.start)[0]
    if (next) {
      const from = clockTime(next.start - early)
      throw conflict(
        'CHECKIN_TOO_EARLY',
        `Chưa đến giờ điểm danh ca "${next.slot}". Bạn có thể điểm danh từ ${from}.`,
        { slot: next.slot, from },
      )
    }
    throw conflict(
      'CHECKIN_ENDED',
      'Ca học hôm nay của bạn đã kết thúc nên không thể tự điểm danh. Vui lòng báo quản trị viên.',
    )
  }

  const { booking, slot } = session
  const alreadyCheckedIn = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ present: attendance.present })
      .from(attendance)
      .where(and(eq(attendance.bookingId, booking.id), eq(attendance.slot, slot)))
      .for('update')
    if (existing?.present) return true

    const values = { present: true, updatedBy: SELF_CHECKIN, updatedAt: new Date() }
    await tx
      .insert(attendance)
      .values({ bookingId: booking.id, slot, ...values })
      .onConflictDoUpdate({ target: [attendance.bookingId, attendance.slot], set: values })
    await audit(tx, {
      actor: 'student',
      action: 'attendance.self_checkin',
      bookingId: booking.id,
      weekLabel: booking.weekLabel,
    })
    return false
  })

  return { zaloName: decryptName(keyring, booking), weekLabel: booking.weekLabel, slot, alreadyCheckedIn }
}
