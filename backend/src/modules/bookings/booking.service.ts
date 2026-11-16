import { randomUUID } from 'node:crypto'
import { and, eq, lt, ne, notInArray } from 'drizzle-orm'

import { attendance, bookings, weeks, type BookingRow } from '../../db/schema.js'
import { normalizeContact, normalizeName } from '../../lib/contact.js'
import { blindIndex, decrypt, encrypt, type Keyring } from '../../lib/crypto.js'
import { badRequest, conflict, notFound } from '../../lib/errors.js'
import { dayLabel, findSameDay, slotDate } from '../../lib/slots.js'
import { localTime, startDateFromLabel } from '../../lib/time.js'
import type { AppDeps } from '../../types.js'
import { audit, type AuditActor } from '../audit/audit.service.js'
import { countSlots } from '../schedule/schedule.service.js'
import { getCurrentWeek, newestFirst, registrationStatus } from '../weeks/weeks.service.js'
import type { SubmitBookingInput } from './booking.schemas.js'

/** Decrypted view of a booking. Only ever returned to the verified student or an admin. */
export interface BookingView {
  id: string
  weekLabel: string
  zaloName: string
  count: 1 | 2 | 3
  slots: string[]
  makeup: string
  consentVersion: string
  consentAt: string
  createdAt: string
  updatedAt: string
}

/** Associated data binds each ciphertext to its row + column. */
const aad = (bookingId: string, field: 'name' | 'contact' | 'makeup') => `booking:${bookingId}:${field}`

const bookingNotFound = (week: string) =>
  notFound('BOOKING_NOT_FOUND', `Không tìm thấy đăng ký tuần ${week} với thông tin này.`, { week })

function requireContact(raw: string) {
  const contact = normalizeContact(raw)
  if (!contact) throw badRequest('INVALID_CONTACT', 'Số điện thoại hoặc email không hợp lệ.')
  return contact
}

export function contactIndex(keyring: Keyring, raw: string) {
  return blindIndex(keyring, 'contact', requireContact(raw).value)
}

export function decryptBooking(keyring: Keyring, row: BookingRow): BookingView {
  const count = row.sessionCount as 1 | 2 | 3
  return {
    id: row.id,
    weekLabel: row.weekLabel,
    zaloName: decrypt(keyring, row.nameEnc, aad(row.id, 'name')),
    count,
    slots: [row.slot1, row.slot2, row.slot3].slice(0, count).map((s) => s ?? ''),
    makeup: row.makeupEnc ? decrypt(keyring, row.makeupEnc, aad(row.id, 'makeup')) : '',
    consentVersion: row.consentVersion,
    consentAt: row.consentAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Decrypts only the Zalo name (for views that must not touch contact or notes). */
export function decryptName(keyring: Keyring, row: Pick<BookingRow, 'id' | 'nameEnc'>) {
  return decrypt(keyring, row.nameEnc, aad(row.id, 'name'))
}

/** Decrypts the contact column — admin use only. */
export function decryptContact(keyring: Keyring, row: BookingRow) {
  return decrypt(keyring, row.contactEnc, aad(row.id, 'contact'))
}

/**
 * Creates or updates a booking for a contact in the week open for registration. Runs in a
 * transaction that locks that week's row, so concurrent submissions can't overbook a slot.
 */
export async function submitBooking(deps: AppDeps, input: SubmitBookingInput) {
  const { db, keyring, config } = deps
  const contact = requireContact(input.contact)
  const contactHash = blindIndex(keyring, 'contact', contact.value)
  const nameHash = blindIndex(keyring, 'name', normalizeName(input.zaloName))

  return db.transaction(async (tx) => {
    const [week] = await tx.select().from(weeks).where(eq(weeks.open, true)).for('update')
    if (!week) throw conflict('BOOKING_CLOSED', 'Đăng ký tuần này đã đóng.')
    const s = { ...week, weekLabel: week.label }
    const status = registrationStatus(s)
    if (status === 'upcoming') {
      throw conflict('BOOKING_NOT_OPEN', 'Đăng ký tuần này chưa mở.', {
        opensAt: s.opensAt!.toISOString(),
      })
    }
    if (status === 'closed') throw conflict('BOOKING_CLOSED', 'Đăng ký tuần này đã đóng.')

    const slots = input.slots.slice(0, input.count)
    for (let i = 0; i < input.count; i++) {
      const slot = slots[i]
      if (!slot) {
        throw badRequest('SLOT_REQUIRED', `Vui lòng chọn ca cho Buổi ${i + 1}.`, { session: i + 1 })
      }
      const allowed = [s.slots1, s.slots2, s.slots3][i]!
      if (!allowed.includes(slot)) {
        throw badRequest('SLOT_INVALID', `Ca "${slot}" không hợp lệ.`, { slot })
      }
    }
    if (new Set(slots).size !== slots.length) {
      throw badRequest('SLOT_DUPLICATE', 'Các buổi không được trùng ca.')
    }
    // With 2+ sessions, each one must be on a different day.
    const sameDay = findSameDay(slots)
    if (sameDay) {
      const day = dayLabel(sameDay)
      throw badRequest('SLOT_SAME_DAY', `Các buổi phải vào các ngày khác nhau (${day} bị chọn 2 lần).`, {
        day,
      })
    }

    const [existing] = await tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.weekLabel, s.weekLabel), eq(bookings.contactHash, contactHash)))

    // A day that is over can't be booked any more (on Tuesday, Monday's slots are closed).
    // Slots the student already holds may stay, so they can still change the rest of the week.
    const today = localTime(deps.now(), config.CLASS_TIMEZONE).date
    const startDate = week.startDate ?? startDateFromLabel(week.label, today)
    if (startDate) {
      const kept = existing ? [existing.slot1, existing.slot2, existing.slot3] : []
      const past = slots.find((slot) => {
        const date = slotDate(startDate, slot)
        return date !== null && date < today && !kept.includes(slot)
      })
      if (past) {
        throw badRequest('SLOT_PAST', `Ca "${past}" thuộc ngày đã qua. Vui lòng chọn ca khác.`, { slot: past })
      }
    }

    const [nameTaken] = await tx
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.weekLabel, s.weekLabel),
          eq(bookings.nameHash, nameHash),
          ne(bookings.contactHash, contactHash),
        ),
      )
      .limit(1)
    if (nameTaken) {
      throw conflict(
        'NAME_TAKEN',
        `Tên Zalo "${input.zaloName}" đã đăng ký tuần này với số điện thoại/email khác. ` +
          'Nếu là bạn, hãy dùng đúng thông tin đã đăng ký.',
        { name: input.zaloName },
      )
    }

    if (s.capacity) {
      const { counts } = await countSlots(tx, s.weekLabel, existing?.id)
      for (const slot of slots) {
        if ((counts[slot] ?? 0) >= s.capacity) {
          throw conflict('SLOT_FULL', `Ca "${slot}" đã đủ người, vui lòng chọn ca khác.`, { slot })
        }
      }
    }

    const id = existing?.id ?? randomUUID()
    const now = new Date()
    const values = {
      weekLabel: s.weekLabel,
      nameEnc: encrypt(keyring, input.zaloName, aad(id, 'name')),
      nameHash,
      contactEnc: encrypt(keyring, contact.value, aad(id, 'contact')),
      contactHash,
      sessionCount: input.count,
      slot1: slots[0]!,
      slot2: slots[1] ?? null,
      slot3: slots[2] ?? null,
      makeupEnc: input.makeup ? encrypt(keyring, input.makeup, aad(id, 'makeup')) : null,
      consentVersion: config.PRIVACY_POLICY_VERSION,
      consentAt: now,
      updatedAt: now,
    }

    if (existing) {
      await tx.update(bookings).set(values).where(eq(bookings.id, id))
      // Attendance marked for slots the student no longer booked would be meaningless.
      await tx
        .delete(attendance)
        .where(and(eq(attendance.bookingId, id), notInArray(attendance.slot, slots)))
    } else await tx.insert(bookings).values({ id, ...values, createdAt: now })

    await audit(tx, {
      actor: 'student',
      action: existing ? 'booking.update' : 'booking.create',
      bookingId: id,
      weekLabel: s.weekLabel,
      detail: { sessionCount: input.count, contactKind: contact.kind },
    })

    return { updated: !!existing, id }
  })
}

/** Finds this week's booking for a contact (student access right). */
export async function lookupBooking(deps: AppDeps, rawContact: string) {
  const { db, keyring } = deps
  const hash = contactIndex(keyring, rawContact)
  const weekLabel = (await getCurrentWeek(db)).label
  const [row] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.weekLabel, weekLabel), eq(bookings.contactHash, hash)))
  if (!row) throw bookingNotFound(weekLabel)
  await audit(db, { actor: 'student', action: 'booking.access', bookingId: row.id, weekLabel })
  const view = decryptBooking(keyring, row)
  return {
    zaloName: view.zaloName,
    count: view.count,
    slots: view.slots,
    makeup: view.makeup,
    weekLabel: view.weekLabel,
  }
}

/** A schedule the student booked in an earlier week, offered again on the booking form. */
export interface PastSchedule {
  weekLabel: string
  count: 1 | 2 | 3
  slots: string[]
}

/** Past weeks scanned for suggestions, and how many different schedules are returned. */
const HISTORY_SCAN = 12
const HISTORY_MAX = 3

/**
 * The student's schedules from earlier weeks (newest first, one per distinct set of slots),
 * so the booking form can offer to book the same times again. Only slot labels are returned
 * (no name, notes or contact), and nothing is decrypted.
 */
export async function bookingHistory(deps: AppDeps, rawContact: string): Promise<PastSchedule[]> {
  const { db, keyring } = deps
  const hash = contactIndex(keyring, rawContact)
  const current = (await getCurrentWeek(db)).label
  const rows = await db
    .select({
      weekLabel: bookings.weekLabel,
      count: bookings.sessionCount,
      slot1: bookings.slot1,
      slot2: bookings.slot2,
      slot3: bookings.slot3,
    })
    .from(bookings)
    .innerJoin(weeks, eq(weeks.label, bookings.weekLabel))
    .where(and(eq(bookings.contactHash, hash), ne(bookings.weekLabel, current)))
    .orderBy(...newestFirst)
    .limit(HISTORY_SCAN)

  const seen = new Set<string>()
  const history: PastSchedule[] = []
  for (const row of rows) {
    const count = row.count as 1 | 2 | 3
    const slots = [row.slot1, row.slot2, row.slot3].slice(0, count).map((s) => s ?? '')
    // The same times in another order are the same schedule.
    const key = [...slots].sort().join('\n')
    if (seen.has(key)) continue
    seen.add(key)
    history.push({ weekLabel: row.weekLabel, count, slots })
    if (history.length === HISTORY_MAX) break
  }

  if (history.length) {
    await audit(db, { actor: 'student', action: 'booking.history', detail: { weeks: history.length } })
  }
  return history
}

/** Deletes this week's booking for a contact (right to withdraw consent / erasure). */
export async function deleteBookingByContact(deps: AppDeps, rawContact: string) {
  const { db, keyring } = deps
  const hash = contactIndex(keyring, rawContact)
  const weekLabel = (await getCurrentWeek(db)).label
  const deleted = await db
    .delete(bookings)
    .where(and(eq(bookings.weekLabel, weekLabel), eq(bookings.contactHash, hash)))
    .returning({ id: bookings.id })
  if (!deleted.length) throw bookingNotFound(weekLabel)
  for (const { id } of deleted) {
    await audit(db, { actor: 'student', action: 'booking.delete', bookingId: id, weekLabel })
  }
}

/** Deletes bookings not updated within the retention period (storage limitation). */
export async function purgeExpiredBookings(deps: AppDeps, actor: AuditActor = 'system') {
  const cutoff = new Date(Date.now() - deps.config.RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const deleted = await deps.db
    .delete(bookings)
    .where(lt(bookings.updatedAt, cutoff))
    .returning({ id: bookings.id })
  if (deleted.length) {
    await audit(deps.db, {
      actor,
      action: 'retention.purge',
      detail: { deleted: deleted.length, retentionDays: deps.config.RETENTION_DAYS },
    })
  }
  return deleted.length
}
