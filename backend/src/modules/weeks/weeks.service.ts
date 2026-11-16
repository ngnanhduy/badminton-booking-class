import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm'

import type { Db } from '../../db/client.js'
import { DEFAULT_WEEK } from '../../db/defaults.js'
import { attendance, bookings, weeks, type WeekRow } from '../../db/schema.js'
import { badRequest, conflict, notFound } from '../../lib/errors.js'
import { audit } from '../audit/audit.service.js'

type Reader = Pick<Db, 'select'>

/** 'upcoming' = switched on, but the opening time hasn't come yet. */
export type RegistrationStatus = 'open' | 'upcoming' | 'closed'

export function registrationStatus(
  w: Pick<WeekRow, 'open' | 'opensAt' | 'closesAt'>,
  now = new Date(),
): RegistrationStatus {
  if (!w.open) return 'closed'
  if (w.closesAt && now >= w.closesAt) return 'closed'
  if (w.opensAt && now < w.opensAt) return 'upcoming'
  return 'open'
}

/** Newest week first: by start date, then by creation. */
export const newestFirst = [sql`${weeks.startDate} DESC NULLS LAST`, desc(weeks.createdAt)]

/**
 * The week the public pages show: the one open for registration, or else the most recent
 * week (shown as closed).
 */
export async function getCurrentWeek(db: Reader): Promise<WeekRow> {
  const [open] = await db.select().from(weeks).where(eq(weeks.open, true)).limit(1)
  if (open) return open
  const [latest] = await db
    .select()
    .from(weeks)
    .orderBy(...newestFirst)
    .limit(1)
  if (!latest) throw new Error('No week found — run migrations')
  return latest
}

export async function getWeekById(db: Reader, id: string): Promise<WeekRow> {
  const [row] = await db.select().from(weeks).where(eq(weeks.id, id))
  if (!row) throw notFound('WEEK_NOT_FOUND', 'Không tìm thấy tuần học.')
  return row
}

/** A week's settings as admins see them. */
export interface WeekDto {
  id: string
  weekLabel: string
  startDate: string | null
  rules: string[]
  slots1: string[]
  slots2: string[]
  slots3: string[]
  /** Slot labels offered for a make-up class (empty = none this week). */
  slotsMakeup: string[]
  capacity: number | null
  open: boolean
  opensAt: string | null
  closesAt: string | null
  status: RegistrationStatus
  createdAt: string
}

export function toWeekDto(w: WeekRow): WeekDto {
  return {
    id: w.id,
    weekLabel: w.label,
    startDate: w.startDate,
    rules: w.rules,
    slots1: w.slots1,
    slots2: w.slots2,
    slots3: w.slots3,
    slotsMakeup: w.slotsMakeup,
    capacity: w.capacity,
    open: w.open,
    opensAt: w.opensAt?.toISOString() ?? null,
    closesAt: w.closesAt?.toISOString() ?? null,
    status: registrationStatus(w),
    createdAt: w.createdAt.toISOString(),
  }
}

/** A week in the admin history: its settings plus counts (no personal data). */
export interface WeekSummary extends WeekDto {
  /** The week the public pages show. */
  current: boolean
  bookings: number
  /** Places taken: sessions plus make-up classes. */
  sessions: number
  present: number
  absent: number
  /** Bookings per slot label (make-up classes included). */
  counts: Record<string, number>
}

/** Every week, newest first, with booking and attendance counts. */
export async function listWeeks(db: Reader): Promise<WeekSummary[]> {
  const [rows, booked, marks] = await Promise.all([
    db
      .select()
      .from(weeks)
      .orderBy(...newestFirst),
    // Slot labels and counts only: no personal data is read.
    db
      .select({
        weekLabel: bookings.weekLabel,
        sessionCount: bookings.sessionCount,
        slot1: bookings.slot1,
        slot2: bookings.slot2,
        slot3: bookings.slot3,
        makeupSlot: bookings.makeupSlot,
      })
      .from(bookings),
    db
      .select({
        weekLabel: bookings.weekLabel,
        present: sql<number>`count(*) FILTER (WHERE ${attendance.present})::int`,
        absent: sql<number>`count(*) FILTER (WHERE NOT ${attendance.present})::int`,
      })
      .from(attendance)
      .innerJoin(bookings, eq(bookings.id, attendance.bookingId))
      .groupBy(bookings.weekLabel),
  ])
  const stats = new Map<string, { bookings: number; sessions: number; counts: Record<string, number> }>()
  for (const b of booked) {
    let s = stats.get(b.weekLabel)
    if (!s) stats.set(b.weekLabel, (s = { bookings: 0, sessions: 0, counts: {} }))
    s.bookings++
    s.sessions += b.sessionCount + (b.makeupSlot ? 1 : 0)
    for (const slot of [b.slot1, b.slot2, b.slot3, b.makeupSlot]) {
      if (slot) s.counts[slot] = (s.counts[slot] ?? 0) + 1
    }
  }
  const marksByWeek = new Map(marks.map((m) => [m.weekLabel, m]))
  const currentId = rows.find((w) => w.open)?.id ?? rows[0]?.id

  return rows.map((w) => ({
    ...toWeekDto(w),
    current: w.id === currentId,
    bookings: stats.get(w.label)?.bookings ?? 0,
    sessions: stats.get(w.label)?.sessions ?? 0,
    counts: stats.get(w.label)?.counts ?? {},
    present: Number(marksByWeek.get(w.label)?.present ?? 0),
    absent: Number(marksByWeek.get(w.label)?.absent ?? 0),
  }))
}

export interface WeekInput {
  weekLabel: string
  startDate: string | null
  rules: string[]
  /** Slots offered for session 1, 2 and 3 of a booking. */
  slots1: string[]
  slots2: string[]
  slots3: string[]
  /** Slots offered for a make-up class (may be empty). */
  slotsMakeup: string[]
  capacity: number | null
  open: boolean
  opensAt: Date | null
  closesAt: Date | null
  /**
   * Slots whose time was edited (update only): bookings and attendance marks of this week
   * move from the old label to the new one.
   */
  slotRenames: SlotRename[]
}

export interface SlotRename {
  from: string
  to: string
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const renameInvalid = (message: string, params?: Record<string, string>) =>
  badRequest('SLOT_RENAME_INVALID', message, params)

/**
 * Moves this week's bookings and attendance marks from each `from` slot to its `to` slot.
 * Two phases (via placeholders) so swaps like A→B, B→A work.
 */
async function renameSlots(
  tx: Tx,
  weekLabel: string,
  renames: SlotRename[],
  before: Set<string>,
  after: Set<string>,
) {
  const list = renames.filter((r) => r.from !== r.to)
  const froms = new Set(list.map((r) => r.from))
  if (froms.size !== list.length || new Set(list.map((r) => r.to)).size !== list.length) {
    throw renameInvalid('Một ca không thể đổi giờ hai lần trong cùng một lần lưu.')
  }
  for (const { from, to } of list) {
    if (!before.has(from)) throw renameInvalid(`Ca "${from}" không có trong tuần này.`, { slot: from })
    if (!after.has(to)) throw renameInvalid(`Ca "${to}" không có trong danh sách ca mới.`, { slot: to })
    // Moving onto a slot that stays as it is would merge two classes.
    if (before.has(to) && !froms.has(to)) {
      throw renameInvalid(`Ca "${to}" đã tồn tại, không thể chuyển ca "${from}" vào đó.`, { slot: to })
    }
  }

  const weekBookings = tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.weekLabel, weekLabel))
  async function move(from: string, to: string) {
    const inWeek = eq(bookings.weekLabel, weekLabel)
    await tx.update(bookings).set({ slot1: to }).where(and(inWeek, eq(bookings.slot1, from)))
    await tx.update(bookings).set({ slot2: to }).where(and(inWeek, eq(bookings.slot2, from)))
    await tx.update(bookings).set({ slot3: to }).where(and(inWeek, eq(bookings.slot3, from)))
    await tx.update(bookings).set({ makeupSlot: to }).where(and(inWeek, eq(bookings.makeupSlot, from)))
    await tx
      .update(attendance)
      .set({ slot: to })
      .where(and(eq(attendance.slot, from), inArray(attendance.bookingId, weekBookings)))
  }
  // PostgreSQL text can't hold NUL bytes, so the placeholder is a random label instead.
  const token = randomUUID()
  const placeholder = (i: number) => `rename:${token}:${i}`
  for (const [i, r] of list.entries()) await move(r.from, placeholder(i))
  for (const [i, r] of list.entries()) await move(placeholder(i), r.to)
  return list.length
}

function checkWindow(opensAt: Date | null, closesAt: Date | null) {
  if (opensAt && closesAt && closesAt <= opensAt) {
    throw badRequest('WINDOW_INVALID', 'Thời gian đóng đăng ký phải sau thời gian mở.')
  }
}

/**
 * Only one week may be open for registration. A week still switched on whose closing time
 * has passed no longer counts: it is switched off here so another week can open.
 */
async function ensureNoOtherOpenWeek(tx: Tx, exceptId: string | null, now = new Date()) {
  const others = await tx
    .select()
    .from(weeks)
    .where(exceptId ? and(eq(weeks.open, true), ne(weeks.id, exceptId)) : eq(weeks.open, true))
    .for('update')
  for (const other of others) {
    if (other.closesAt && other.closesAt <= now) {
      await tx.update(weeks).set({ open: false, updatedAt: now }).where(eq(weeks.id, other.id))
      continue
    }
    throw weekAlreadyOpen(other.label)
  }
}

const weekAlreadyOpen = (week: string) =>
  conflict(
    'WEEK_ALREADY_OPEN',
    `Tuần ${week} đang mở đăng ký. Chỉ được mở một tuần — hãy đóng tuần đó trước.`,
    { week },
  )
const weekExists = (week: string) => conflict('WEEK_EXISTS', `Tuần "${week}" đã tồn tại.`, { week })

/** Turns unique-index races (two admins at once) into the same errors as the checks. */
async function translateUniqueViolation(db: Db, error: unknown, label: string): Promise<never> {
  type PgError = { code?: string; constraint?: string; cause?: unknown }
  for (let e = error as PgError | undefined; e; e = e.cause as PgError | undefined) {
    if (e.code !== '23505') continue
    if (e.constraint === 'weeks_single_open') throw weekAlreadyOpen((await getCurrentWeek(db)).label)
    if (e.constraint === 'weeks_label_uq') throw weekExists(label)
  }
  throw error
}

/**
 * Creates a week. Slots, rules and capacity not given are copied from the most recent week,
 * so admins only change what differs.
 */
export async function createWeek(
  db: Db,
  input: Partial<Omit<WeekInput, 'slotRenames'>> & Pick<WeekInput, 'weekLabel'>,
  by: { actorId: string },
): Promise<WeekRow> {
  const opensAt = input.opensAt ?? null
  const closesAt = input.closesAt ?? null
  checkWindow(opensAt, closesAt)
  const open = input.open ?? false
  try {
    return await db.transaction(async (tx) => {
      const [taken] = await tx.select({ id: weeks.id }).from(weeks).where(eq(weeks.label, input.weekLabel))
      if (taken) throw weekExists(input.weekLabel)
      if (open) await ensureNoOtherOpenWeek(tx, null)

      const [template] = await tx
        .select()
        .from(weeks)
        .orderBy(...newestFirst)
        .limit(1)
      const base = template ?? DEFAULT_WEEK
      const now = new Date()
      const [row] = await tx
        .insert(weeks)
        .values({
          id: randomUUID(),
          label: input.weekLabel,
          startDate: input.startDate ?? null,
          rules: input.rules ?? base.rules,
          slots1: input.slots1 ?? base.slots1,
          slots2: input.slots2 ?? base.slots2,
          // Clients from before session 3 had its own list send only slots2 (used for both).
          slots3: input.slots3 ?? input.slots2 ?? base.slots3,
          slotsMakeup: input.slotsMakeup ?? base.slotsMakeup,
          capacity: input.capacity === undefined ? base.capacity : input.capacity,
          open,
          opensAt,
          closesAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      await audit(tx, {
        actor: 'admin',
        actorId: by.actorId,
        action: 'week.create',
        weekLabel: input.weekLabel,
        detail: { open, opensAt: opensAt?.toISOString() ?? null, closesAt: closesAt?.toISOString() ?? null },
      })
      return row!
    })
  } catch (error) {
    return translateUniqueViolation(db, error, input.weekLabel)
  }
}

/** Changes a week's settings. Renaming a week renames its bookings too (FK cascade). */
export async function updateWeek(
  db: Db,
  id: string,
  changes: Partial<WeekInput>,
  by: { actorId: string },
): Promise<WeekRow> {
  try {
    return await db.transaction(async (tx) => {
      const [week] = await tx.select().from(weeks).where(eq(weeks.id, id)).for('update')
      if (!week) throw notFound('WEEK_NOT_FOUND', 'Không tìm thấy tuần học.')

      checkWindow(
        changes.opensAt === undefined ? week.opensAt : changes.opensAt,
        changes.closesAt === undefined ? week.closesAt : changes.closesAt,
      )
      if (changes.weekLabel !== undefined && changes.weekLabel !== week.label) {
        const [taken] = await tx.select({ id: weeks.id }).from(weeks).where(eq(weeks.label, changes.weekLabel))
        if (taken) throw weekExists(changes.weekLabel)
      }
      if (changes.open && !week.open) await ensureNoOtherOpenWeek(tx, id)

      const { weekLabel, slotRenames, ...rest } = changes
      // Clients from before session 3 had its own list send only slots2 (used for both).
      if (rest.slots2 && !rest.slots3) rest.slots3 = rest.slots2
      const [row] = await tx
        .update(weeks)
        .set({ ...rest, ...(weekLabel !== undefined && { label: weekLabel }), updatedAt: new Date() })
        .where(eq(weeks.id, id))
        .returning()
      // After the update: a renamed week's bookings already carry the new label (FK cascade).
      const renamed = slotRenames?.length
        ? await renameSlots(
            tx,
            row!.label,
            slotRenames,
            new Set([...week.slots1, ...week.slots2, ...week.slots3, ...week.slotsMakeup]),
            new Set([...row!.slots1, ...row!.slots2, ...row!.slots3, ...row!.slotsMakeup]),
          )
        : 0
      await audit(tx, {
        actor: 'admin',
        actorId: by.actorId,
        action: 'week.update',
        weekLabel: row!.label,
        detail: {
          fields: Object.keys(changes),
          ...(weekLabel !== undefined && weekLabel !== week.label && { previousLabel: week.label }),
          ...(renamed && { slotsRenamed: renamed }),
        },
      })
      return row!
    })
  } catch (error) {
    return translateUniqueViolation(db, error, changes.weekLabel ?? '')
  }
}
