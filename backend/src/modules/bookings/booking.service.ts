import { randomUUID } from 'node:crypto'
import { and, eq, lt, ne } from 'drizzle-orm'

import { bookings, settings, type BookingRow } from '../../db/schema.js'
import { normalizeContact, normalizeName } from '../../lib/contact.js'
import { blindIndex, decrypt, encrypt, type Keyring } from '../../lib/crypto.js'
import { badRequest, conflict, notFound } from '../../lib/errors.js'
import type { AppDeps } from '../../types.js'
import { audit, type AuditActor } from '../audit/audit.service.js'
import { countSlots, getSettings } from '../schedule/schedule.service.js'
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

/** Decrypts the contact column — admin use only. */
export function decryptContact(keyring: Keyring, row: BookingRow) {
  return decrypt(keyring, row.contactEnc, aad(row.id, 'contact'))
}

/**
 * Creates or updates this week's booking for a contact. Runs in a transaction that locks
 * the settings row, so concurrent submissions can't overbook a slot.
 */
export async function submitBooking(deps: AppDeps, input: SubmitBookingInput) {
  const { db, keyring, config } = deps
  const contact = requireContact(input.contact)
  const contactHash = blindIndex(keyring, 'contact', contact.value)
  const nameHash = blindIndex(keyring, 'name', normalizeName(input.zaloName))

  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(settings).where(eq(settings.id, 1)).for('update')
    if (!s) throw new Error('Settings row missing')
    if (!s.open) throw conflict('BOOKING_CLOSED', 'Đăng ký tuần này đã đóng.')

    const slots = input.slots.slice(0, input.count)
    for (let i = 0; i < input.count; i++) {
      const slot = slots[i]
      if (!slot) {
        throw badRequest('SLOT_REQUIRED', `Vui lòng chọn ca cho Buổi ${i + 1}.`, { session: i + 1 })
      }
      const allowed = i === 0 ? s.slots1 : s.slots2
      if (!allowed.includes(slot)) {
        throw badRequest('SLOT_INVALID', `Ca "${slot}" không hợp lệ.`, { slot })
      }
    }
    if (new Set(slots).size !== slots.length) {
      throw badRequest('SLOT_DUPLICATE', 'Các buổi không được trùng ca.')
    }

    const [existing] = await tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.weekLabel, s.weekLabel), eq(bookings.contactHash, contactHash)))

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

    if (existing) await tx.update(bookings).set(values).where(eq(bookings.id, id))
    else await tx.insert(bookings).values({ id, ...values, createdAt: now })

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
  const s = await getSettings(db)
  const [row] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.weekLabel, s.weekLabel), eq(bookings.contactHash, hash)))
  if (!row) throw bookingNotFound(s.weekLabel)
  await audit(db, { actor: 'student', action: 'booking.access', bookingId: row.id, weekLabel: s.weekLabel })
  const view = decryptBooking(keyring, row)
  return {
    zaloName: view.zaloName,
    count: view.count,
    slots: view.slots,
    makeup: view.makeup,
    weekLabel: view.weekLabel,
  }
}

/** Deletes this week's booking for a contact (right to withdraw consent / erasure). */
export async function deleteBookingByContact(deps: AppDeps, rawContact: string) {
  const { db, keyring } = deps
  const hash = contactIndex(keyring, rawContact)
  const s = await getSettings(db)
  const deleted = await db
    .delete(bookings)
    .where(and(eq(bookings.weekLabel, s.weekLabel), eq(bookings.contactHash, hash)))
    .returning({ id: bookings.id })
  if (!deleted.length) throw bookingNotFound(s.weekLabel)
  for (const { id } of deleted) {
    await audit(db, { actor: 'student', action: 'booking.delete', bookingId: id, weekLabel: s.weekLabel })
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
