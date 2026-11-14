import { attendance, bookings, type BookingRow } from '../../db/schema.js'
import type { AppDeps } from '../../types.js'
import { decryptName } from '../bookings/booking.service.js'
import { getSettings } from '../schedule/schedule.service.js'

/**
 * One student across every week still kept (within the retention period). This is shown
 * publicly, so it deliberately has no phone/email, notes or ids: only what members need.
 */
export interface MemberView {
  /** Zalo name from the most recent booking. */
  zaloName: string
  /** Number of weeks booked. */
  weeks: number
  /** Sessions booked in total. */
  sessions: number
  /** This week's booking, or null if they haven't booked this week. */
  thisWeek: { count: number; slots: string[] } | null
  lastWeekLabel: string
  firstBookedAt: string
  lastBookedAt: string
  /** Sessions marked present / absent by an admin. */
  attended: number
  absent: number
}

const slotsOf = (row: BookingRow) =>
  [row.slot1, row.slot2, row.slot3].slice(0, row.sessionCount).map((s) => s ?? '')

/** Groups every booking by student (same phone/email, via its blind index). */
export async function listMembers(deps: AppDeps): Promise<{ weekLabel: string; members: MemberView[] }> {
  const { db, keyring } = deps
  const { weekLabel } = await getSettings(db)
  const rows = await db.select().from(bookings)
  const marks = await db
    .select({ bookingId: attendance.bookingId, present: attendance.present })
    .from(attendance)

  const marksByBooking = new Map<string, { attended: number; absent: number }>()
  for (const m of marks) {
    const tally = marksByBooking.get(m.bookingId) ?? { attended: 0, absent: 0 }
    if (m.present) tally.attended++
    else tally.absent++
    marksByBooking.set(m.bookingId, tally)
  }

  const groups = new Map<string, BookingRow[]>()
  for (const row of rows) {
    const group = groups.get(row.contactHash)
    if (group) group.push(row)
    else groups.set(row.contactHash, [row])
  }

  const members = [...groups.values()].map((group): MemberView => {
    group.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    const latest = group[0]!
    const current = group.find((r) => r.weekLabel === weekLabel)
    let attended = 0
    let absent = 0
    for (const row of group) {
      const tally = marksByBooking.get(row.id)
      attended += tally?.attended ?? 0
      absent += tally?.absent ?? 0
    }
    return {
      // Only the name is decrypted; the contact column is never read here.
      zaloName: decryptName(keyring, latest),
      weeks: group.length,
      sessions: group.reduce((sum, r) => sum + r.sessionCount, 0),
      thisWeek: current ? { count: current.sessionCount, slots: slotsOf(current) } : null,
      lastWeekLabel: latest.weekLabel,
      firstBookedAt: group[group.length - 1]!.createdAt.toISOString(),
      lastBookedAt: latest.updatedAt.toISOString(),
      attended,
      absent,
    }
  })

  members.sort((a, b) => a.zaloName.localeCompare(b.zaloName, 'vi'))
  return { weekLabel, members }
}
