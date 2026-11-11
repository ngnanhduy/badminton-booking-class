import { and, eq, ne } from 'drizzle-orm'

import type { AppConfig } from '../../config/env.js'
import type { Db } from '../../db/client.js'
import { bookings, settings, type SettingsRow } from '../../db/schema.js'

export interface ScheduleDto {
  weekLabel: string
  rules: string[]
  slots1: string[]
  slots2: string[]
  capacity: number | null
  open: boolean
  counts: Record<string, number>
  totalBookings: number
  privacy: {
    policyVersion: string
    retentionDays: number
    controllerName: string
    controllerContact: string
  }
}

type Reader = Pick<Db, 'select'>

export async function getSettings(db: Reader): Promise<SettingsRow> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1))
  if (!row) throw new Error('Settings row missing — run migrations')
  return row
}

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

export async function getSchedule(db: Reader, config: AppConfig): Promise<ScheduleDto> {
  const s = await getSettings(db)
  const { counts, total } = await countSlots(db, s.weekLabel)
  return {
    weekLabel: s.weekLabel,
    rules: s.rules,
    slots1: s.slots1,
    slots2: s.slots2,
    capacity: s.capacity,
    open: s.open,
    counts,
    totalBookings: total,
    privacy: {
      policyVersion: config.PRIVACY_POLICY_VERSION,
      retentionDays: config.RETENTION_DAYS,
      controllerName: config.CONTROLLER_NAME,
      controllerContact: config.CONTROLLER_CONTACT,
    },
  }
}
