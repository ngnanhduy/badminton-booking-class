import { count, eq } from 'drizzle-orm'

import { attendance, bookings, weeks, type BookingRow } from '../../db/schema.js'
import { notFound } from '../../lib/errors.js'
import type { AppDeps } from '../../types.js'
import { decryptContact, decryptName } from '../bookings/booking.service.js'
import {
  getCurrentWeek,
  newestFirst,
  registrationStatus,
  type RegistrationStatus,
} from '../weeks/weeks.service.js'

/**
 * One student across every week still kept (within the retention period). The public list
 * deliberately has no phone/email, notes or ids: only what members need.
 */
export interface MemberView {
  /** Zalo name from the most recent booking. */
  zaloName: string
  /**
   * Phone or email (normalized). Only in the admin list (GET /admin/members, audited);
   * the public list never has it.
   */
  contact?: string
  /** Number of weeks booked. */
  weeks: number
  /** Sessions booked in total (make-up classes included). */
  sessions: number
  /**
   * Their booking in the chosen week, or null if they didn't book it: every class they come
   * to, a make-up class included (not marked as one). Which session they missed is not shown
   * publicly (the privacy notice promises totals only).
   */
  week: { count: number; slots: string[] } | null
  lastWeekLabel: string
  firstBookedAt: string
  lastBookedAt: string
  /** Sessions marked present / absent by an admin, over all weeks. */
  attended: number
  absent: number
}

/** A week members can pick on the dashboard (no settings, no personal data). */
export interface MemberWeek {
  weekLabel: string
  startDate: string | null
  status: RegistrationStatus
  /** The week the public pages show (and the dashboard's default). */
  current: boolean
  /** Number of students booked that week. */
  bookings: number
}

export interface MemberList {
  /** The week `members[].week` refers to. */
  weekLabel: string
  /** Every week, newest first. */
  weeks: MemberWeek[]
  /** Sessions of the chosen week marked present / absent, for the whole class. */
  attendance: { present: number; absent: number }
  members: MemberView[]
}

/** The classes a booking comes to: its sessions, then its make-up class if any. */
const slotsOf = (row: BookingRow) => {
  const slots = [row.slot1, row.slot2, row.slot3].slice(0, row.sessionCount).map((s) => s ?? '')
  if (row.makeupSlot) slots.push(row.makeupSlot)
  return slots
}

/** Weeks newest first, with how many students booked each. */
async function listMemberWeeks(deps: AppDeps, currentLabel: string): Promise<MemberWeek[]> {
  const [rows, booked] = await Promise.all([
    deps.db
      .select()
      .from(weeks)
      .orderBy(...newestFirst),
    deps.db
      .select({ weekLabel: bookings.weekLabel, n: count() })
      .from(bookings)
      .groupBy(bookings.weekLabel),
  ])
  const perWeek = new Map(booked.map((b) => [b.weekLabel, Number(b.n)]))
  return rows.map((w) => ({
    weekLabel: w.label,
    startDate: w.startDate,
    status: registrationStatus(w),
    current: w.label === currentLabel,
    bookings: perWeek.get(w.label) ?? 0,
  }))
}

export interface ListMembersOptions {
  /** Also decrypt each student's phone/email. Admin use only (the caller audits it). */
  withContact?: boolean
}

/**
 * Groups every booking by student (same phone/email, via its blind index). `week` picks the
 * week whose bookings are shown per member (default: the current week).
 */
export async function listMembers(
  deps: AppDeps,
  week?: string,
  { withContact = false }: ListMembersOptions = {},
): Promise<MemberList> {
  const { db, keyring } = deps
  const currentLabel = (await getCurrentWeek(db)).label
  let weekLabel = currentLabel
  if (week && week !== currentLabel) {
    const [found] = await db.select({ label: weeks.label }).from(weeks).where(eq(weeks.label, week))
    if (!found) throw notFound('WEEK_NOT_FOUND', 'Không tìm thấy tuần học.')
    weekLabel = found.label
  }

  const [weekList, rows, marks] = await Promise.all([
    listMemberWeeks(deps, currentLabel),
    db.select().from(bookings),
    db.select({ bookingId: attendance.bookingId, present: attendance.present }).from(attendance),
  ])

  const marksByBooking = new Map<string, { attended: number; absent: number }>()
  for (const m of marks) {
    let tally = marksByBooking.get(m.bookingId)
    if (!tally) marksByBooking.set(m.bookingId, (tally = { attended: 0, absent: 0 }))
    if (m.present) tally.attended++
    else tally.absent++
  }
  const weekAttendance = { present: 0, absent: 0 }
  for (const row of rows) {
    if (row.weekLabel !== weekLabel) continue
    weekAttendance.present += marksByBooking.get(row.id)?.attended ?? 0
    weekAttendance.absent += marksByBooking.get(row.id)?.absent ?? 0
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
    const chosen = group.find((r) => r.weekLabel === weekLabel)
    let attended = 0
    let absent = 0
    for (const row of group) {
      const tally = marksByBooking.get(row.id)
      attended += tally?.attended ?? 0
      absent += tally?.absent ?? 0
    }
    return {
      // Only the name is decrypted; the contact column is read only for the admin list.
      // Every booking of a group has the same contact (that's how they are grouped).
      zaloName: decryptName(keyring, latest),
      ...(withContact && { contact: decryptContact(keyring, latest) }),
      weeks: group.length,
      sessions: group.reduce((sum, r) => sum + r.sessionCount + (r.makeupSlot ? 1 : 0), 0),
      week: chosen ? { count: slotsOf(chosen).length, slots: slotsOf(chosen) } : null,
      lastWeekLabel: latest.weekLabel,
      firstBookedAt: group[group.length - 1]!.createdAt.toISOString(),
      lastBookedAt: latest.updatedAt.toISOString(),
      attended,
      absent,
    }
  })

  members.sort((a, b) => a.zaloName.localeCompare(b.zaloName, 'vi'))
  return { weekLabel, weeks: weekList, attendance: weekAttendance, members }
}
