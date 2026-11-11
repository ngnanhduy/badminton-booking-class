import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { auditLogs, bookings } from '../src/db/schema.js'
import { createTestApp, validBooking } from './helpers.js'

let ctx: Awaited<ReturnType<typeof createTestApp>>

beforeAll(async () => {
  ctx = await createTestApp()
})
afterAll(() => ctx.close())
beforeEach(async () => {
  await ctx.database.db.delete(bookings)
  await ctx.database.db.delete(auditLogs)
})

const post = (url: string, payload: unknown) =>
  ctx.app.inject({ method: 'POST', url: `/api/v1${url}`, payload: payload as object })

describe('GET /schedule', () => {
  it('returns settings, counts and privacy info', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/schedule' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.weekLabel).toBe('9/11 - 15/11')
    expect(body.slots1).toContain('Thứ 2 18h - 20h')
    expect(body.totalBookings).toBe(0)
    expect(body.privacy).toMatchObject({ retentionDays: 180 })
  })
})

describe('POST /bookings', () => {
  it('creates a booking and stores personal data encrypted', async () => {
    const res = await post('/bookings', validBooking({ makeup: 'Bù ca 3/11' }))
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ updated: false, config: { counts: { 'Thứ 2 18h - 20h': 1 } } })

    const [row] = await ctx.database.db.select().from(bookings)
    const raw = JSON.stringify(row)
    expect(raw).not.toContain('Minh Anh')
    expect(raw).not.toContain('0912345678')
    expect(raw).not.toContain('Bù ca')
    expect(row!.contactEnc).toMatch(/^v1\.1\./)
    expect(row!.consentVersion).toBe('2026-11-10')
  })

  it('requires explicit consent', async () => {
    const res = await post('/bookings', validBooking({ consent: false }))
    expect(res.statusCode).toBe(400)
    expect(res.json().error.message).toContain('đồng ý')
  })

  it('validates contact, slots and duplicates', async () => {
    expect((await post('/bookings', validBooking({ contact: '123' }))).json().error.code).toBe(
      'INVALID_CONTACT',
    )
    expect((await post('/bookings', validBooking({ slots: ['Thứ 9 1h - 2h'] }))).json().error.code).toBe(
      'SLOT_INVALID',
    )
    expect(
      (await post('/bookings', validBooking({ count: 2, slots: ['Thứ 2 18h - 20h', 'Thứ 2 18h - 20h'] })))
        .json().error.code,
    ).toBe('SLOT_DUPLICATE')
    // Thứ 3 14h is only offered for sessions 2 and 3
    expect((await post('/bookings', validBooking({ slots: ['Thứ 3 14h - 16h'] }))).statusCode).toBe(400)
  })

  it('updates the booking for the same contact (any format) instead of duplicating', async () => {
    await post('/bookings', validBooking())
    const res = await post(
      '/bookings',
      validBooking({ contact: '+84 912.345.678', slots: ['Thứ 4 18h - 20h'] }),
    )
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.updated).toBe(true)
    expect(body.config.totalBookings).toBe(1)
    expect(body.config.counts).toEqual({ 'Thứ 4 18h - 20h': 1 })
  })

  it('rejects a Zalo name already used with a different contact', async () => {
    await post('/bookings', validBooking())
    const res = await post('/bookings', validBooking({ zaloName: 'minh  anh', contact: 'x@y.com' }))
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('NAME_TAKEN')
  })

  it('enforces slot capacity', async () => {
    await ctx.database.db.execute(sql`UPDATE settings SET capacity = 1`)
    await post('/bookings', validBooking())
    const res = await post('/bookings', validBooking({ zaloName: 'Lan', contact: 'lan@example.com' }))
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('SLOT_FULL')
    await ctx.database.db.execute(sql`UPDATE settings SET capacity = 8`)
  })

  it('rejects bookings when closed', async () => {
    await ctx.database.db.execute(sql`UPDATE settings SET open = false`)
    const res = await post('/bookings', validBooking())
    await ctx.database.db.execute(sql`UPDATE settings SET open = true`)
    expect(res.json().error.code).toBe('BOOKING_CLOSED')
  })
})

describe('lookup and delete (data subject rights)', () => {
  it('finds the booking by contact and returns decrypted data without the contact', async () => {
    await post('/bookings', validBooking({ count: 2, slots: ['Thứ 2 18h - 20h', 'Thứ 3 14h - 16h'] }))
    const res = await post('/bookings/lookup', { contact: '0912345678' })
    expect(res.statusCode).toBe(200)
    expect(res.json().booking).toEqual({
      zaloName: 'Minh Anh',
      count: 2,
      slots: ['Thứ 2 18h - 20h', 'Thứ 3 14h - 16h'],
      makeup: '',
      weekLabel: '9/11 - 15/11',
    })
    expect(res.body).not.toContain('0912')
  })

  it('returns 404 for an unknown contact', async () => {
    const res = await post('/bookings/lookup', { contact: '0999999999' })
    expect(res.statusCode).toBe(404)
  })

  it('deletes the booking and logs it without personal data', async () => {
    await post('/bookings', validBooking())
    const res = await post('/bookings/delete', { contact: '0912 345 678' })
    expect(res.statusCode).toBe(200)
    expect(res.json().config.totalBookings).toBe(0)

    const logs = await ctx.database.db.select().from(auditLogs)
    expect(logs.map((l) => l.action)).toEqual(['booking.create', 'booking.delete'])
    expect(JSON.stringify(logs)).not.toMatch(/Minh|0912/)
  })
})

describe('retention', () => {
  it('purges bookings older than RETENTION_DAYS', async () => {
    await post('/bookings', validBooking())
    await ctx.database.db.execute(sql`UPDATE bookings SET updated_at = now() - interval '200 days'`)
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/admin/retention/purge',
      headers: { authorization: 'Bearer test-admin-token-0123456789abcdefghijklmnop' },
    })
    expect(res.json()).toEqual({ deleted: 1 })
  })
})
