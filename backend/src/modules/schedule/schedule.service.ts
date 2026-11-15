import { and, eq, ne } from 'drizzle-orm'

import type { AppConfig } from '../../config/env.js'
import type { Db } from '../../db/client.js'
import { bookings } from '../../db/schema.js'
import { getCurrentWeek, registrationStatus, type RegistrationStatus } from '../weeks/weeks.service.js'

export interface ScheduleDto {
  weekLabel: string
  /** First day of the week ("YYYY-MM-DD"), or null for older weeks without one. */
  startDate: string | null
  rules: string[]
  /** Slot labels offered for session 1, 2 and 3 of a booking. */
  slots1: string[]
  slots2: string[]
  slots3: string[]
  capacity: number | null
  /** The admin's on/off switch. */
  open: boolean
  /** Registration window (ISO), or null when unbounded. */
  opensAt: string | null
  closesAt: string | null
  /** Whether bookings are accepted right now (switch + window). */
  status: RegistrationStatus
  counts: Record<string, number>
  totalBookings: number
  /** Self check-in opens this many minutes before a class starts. */
  checkInEarlyMinutes: number
  privacy: {
    policyVersion: string
    retentionDays: number
    controllerName: string
    controllerContact: string
  }
}

type Reader = Pick<Db, 'select'>

/** Bookings per slot for a week, optionally ignoring one booking (the one being updated). */
export async function countSlots(db: Reader, weekLabel: string, excludeId?: string) {
  const where = excludeId
    ? and(eq(bookings.weekLabel, weekLabel), ne(bookings.id, excludeId))
    : eq(bookings.weekLabel, weekLabel)
  const rows = await db
    .select({ slot1: bookings.slot1, slot2: bookings.slot2, slot3: bookings.slot3 })
    .from(bookings)
    .where(where)

  const counts: Record<string, number> = {}
  for (const row of rows) {
    for (const slot of [row.slot1, row.slot2, row.slot3]) {
      if (slot) counts[slot] = (counts[slot] ?? 0) + 1
    }
  }
  return { counts, total: rows.length }
}

/** The week the public pages show (the open one, else the latest), with slot counts. */
export async function getSchedule(db: Reader, config: AppConfig): Promise<ScheduleDto> {
  const w = await getCurrentWeek(db)
  const { counts, total } = await countSlots(db, w.label)
  return {
    weekLabel: w.label,
    startDate: w.startDate,
    rules: w.rules,
    slots1: w.slots1,
    slots2: w.slots2,
    slots3: w.slots3,
    capacity: w.capacity,
    open: w.open,
    opensAt: w.opensAt?.toISOString() ?? null,
    closesAt: w.closesAt?.toISOString() ?? null,
    status: registrationStatus(w),
    counts,
    totalBookings: total,
    checkInEarlyMinutes: config.CHECKIN_EARLY_MINUTES,
    privacy: {
      policyVersion: config.PRIVACY_POLICY_VERSION,
      retentionDays: config.RETENTION_DAYS,
      controllerName: config.CONTROLLER_NAME,
      controllerContact: config.CONTROLLER_CONTACT,
    },
  }
}
