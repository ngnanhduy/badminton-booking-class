import { eq, inArray, sql } from 'drizzle-orm'

import { attendance, bookings } from '../../db/schema.js'
import type { Db } from '../../db/client.js'
import { badRequest } from '../../lib/errors.js'
import type { AppDeps } from '../../types.js'
import { audit } from '../audit/audit.service.js'

export interface AttendanceMark {
  bookingId: string
  slot: string
  present: boolean
}

/** Attendance marked so far for every booking of a week. Unmarked sessions have no entry. */
export async function listAttendance(db: Pick<Db, 'select'>, weekLabel: string) {
  const rows = await db
    .select({
      bookingId: attendance.bookingId,
      slot: attendance.slot,
      present: attendance.present,
      updatedBy: attendance.updatedBy,
      updatedAt: attendance.updatedAt,
    })
    .from(attendance)
    .innerJoin(bookings, eq(bookings.id, attendance.bookingId))
    .where(eq(bookings.weekLabel, weekLabel))
  return rows.map(({ updatedBy, ...r }) => ({
    ...r,
    /** Marked by the student with self check-in (not by an admin). */
    self: updatedBy === 'self',
    updatedAt: r.updatedAt.toISOString(),
  }))
}

/**
 * Saves present/absent marks. Each slot must be one the student actually booked, so the
 * attendance list always matches the bookings. Applied all-or-nothing.
 */
export async function markAttendance(
  deps: AppDeps,
  marks: AttendanceMark[],
  by: { actorId: string },
) {
  return deps.db.transaction(async (tx) => {
    const ids = [...new Set(marks.map((m) => m.bookingId))]
    const rows = await tx
      .select({
        id: bookings.id,
        weekLabel: bookings.weekLabel,
        count: bookings.sessionCount,
        slot1: bookings.slot1,
        slot2: bookings.slot2,
        slot3: bookings.slot3,
        makeupSlot: bookings.makeupSlot,
      })
      .from(bookings)
      .where(inArray(bookings.id, ids))
    const byId = new Map(rows.map((r) => [r.id, r]))

    for (const mark of marks) {
      const booking = byId.get(mark.bookingId)
      if (!booking) throw badRequest('BOOKING_NOT_FOUND', 'Không tìm thấy đăng ký.')
      const booked = [booking.slot1, booking.slot2, booking.slot3].slice(0, booking.count)
      if (booking.makeupSlot) booked.push(booking.makeupSlot)
      if (!booked.includes(mark.slot)) {
        throw badRequest('SLOT_NOT_BOOKED', `Học viên không đăng ký ca "${mark.slot}".`, {
          slot: mark.slot,
        })
      }
    }

    const now = new Date()
    await tx
      .insert(attendance)
      .values(marks.map((m) => ({ ...m, updatedBy: by.actorId, updatedAt: now })))
      .onConflictDoUpdate({
        target: [attendance.bookingId, attendance.slot],
        set: {
          present: sql`excluded.present`,
          updatedBy: sql`excluded.updated_by`,
          updatedAt: sql`excluded.updated_at`,
        },
      })

    const weeks = [...new Set(rows.map((r) => r.weekLabel))]
    await audit(tx, {
      actor: 'admin',
      actorId: by.actorId,
      action: 'attendance.mark',
      bookingId: ids.length === 1 ? ids[0] : null,
      weekLabel: weeks.length === 1 ? weeks[0] : null,
      detail: {
        rows: marks.length,
        present: marks.filter((m) => m.present).length,
        absent: marks.filter((m) => !m.present).length,
      },
    })
    return { saved: marks.length }
  })
}
