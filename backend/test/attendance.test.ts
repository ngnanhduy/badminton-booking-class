import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { attendance, auditLogs, bookings } from '../src/db/schema.js'
import { findSameDay, slotDay } from '../src/lib/slots.js'
import { ADMIN_TOKEN, createTestApp, seededWeekLabel, validBooking } from './helpers.js'

let ctx: Awaited<ReturnType<typeof createTestApp>>
const auth = { authorization: `Bearer ${ADMIN_TOKEN}` }

beforeAll(async () => {
  ctx = await createTestApp()
})
afterAll(() => ctx.close())
beforeEach(async () => {
  await ctx.database.db.delete(attendance)
  await ctx.database.db.delete(bookings)
  await ctx.database.db.delete(auditLogs)
})

const book = (overrides: Record<string, unknown> = {}) =>
  ctx.app.inject({ method: 'POST', url: '/api/v1/bookings', payload: validBooking(overrides) })

const adminGet = (url: string) => ctx.app.inject({ method: 'GET', url: `/api/v1/admin${url}`, headers: auth })

const mark = (marks: unknown[]) =>
  ctx.app.inject({ method: 'PUT', url: '/api/v1/admin/attendance', headers: auth, payload: { marks } })

async function bookingIds() {
  const list = (await adminGet('/bookings')).json().bookings as { id: string; zaloName: string }[]
  return Object.fromEntries(list.map((b) => [b.zaloName, b.id]))
}

describe('slotDay', () => {
  it('reads the weekday of a slot label', () => {
    expect(slotDay('Thứ 2 18h - 20h')).toBe('2')
    expect(slotDay('thứ 7 14h - 16h')).toBe('7')
    expect(slotDay('Chủ nhật 10h - 12h')).toBe('cn')
    expect(slotDay('CN 9h - 11h')).toBe('cn')
    expect(slotDay('Buổi bù đặc biệt')).toBeNull()
  })

  it('finds a day used twice, ignoring free-text slots', () => {
    expect(findSameDay(['Thứ 2 18h - 20h', 'Thứ 3 18h - 20h'])).toBeNull()
    expect(findSameDay(['Thứ 2 18h - 20h', 'Thứ 3 18h - 20h', 'Thứ 2 20h - 22h'])).toBe('2')
    expect(findSameDay(['Chủ nhật 10h - 12h', 'CN 14h - 16h'])).toBe('cn')
    expect(findSameDay(['Lớp A', 'Lớp B'])).toBeNull()
  })
})

describe('attendance', () => {
  it('requires admin access', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/attendance' })
    expect(res.statusCode).toBe(401)
    const put = await ctx.app.inject({ method: 'PUT', url: '/api/v1/admin/attendance', payload: { marks: [] } })
    expect(put.statusCode).toBe(401)
  })

  it('marks booked sessions present/absent, updates marks and audits them', async () => {
    await book({ count: 2, slots: ['Thứ 2 18h - 20h', 'Thứ 4 18h - 20h'] })
    await book({ zaloName: 'Hoa', contact: 'hoa@example.com' })
    const ids = await bookingIds()

    const res = await mark([
      { bookingId: ids['Minh Anh'], slot: 'Thứ 2 18h - 20h', present: true },
      { bookingId: ids['Hoa'], slot: 'Thứ 2 18h - 20h', present: false },
    ])
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ saved: 2 })

    // Re-marking overwrites instead of duplicating.
    await mark([{ bookingId: ids['Hoa'], slot: 'Thứ 2 18h - 20h', present: true }])

    const list = (await adminGet('/attendance')).json()
    expect(list.weekLabel).toBe(seededWeekLabel())
    expect(list.records).toHaveLength(2)
    expect(list.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bookingId: ids['Minh Anh'], slot: 'Thứ 2 18h - 20h', present: true }),
        expect.objectContaining({ bookingId: ids['Hoa'], slot: 'Thứ 2 18h - 20h', present: true }),
      ]),
    )

    const logs = await ctx.database.db.select().from(auditLogs)
    expect(logs.filter((l) => l.action === 'attendance.mark')).toHaveLength(2)
  })

  it('rejects slots the student did not book, and unknown bookings', async () => {
    await book()
    const ids = await bookingIds()
    const wrongSlot = await mark([{ bookingId: ids['Minh Anh'], slot: 'Thứ 4 18h - 20h', present: true }])
    expect(wrongSlot.statusCode).toBe(400)
    expect(wrongSlot.json().error.code).toBe('SLOT_NOT_BOOKED')

    const unknown = await mark([
      { bookingId: '00000000-0000-4000-8000-000000000000', slot: 'Thứ 2 18h - 20h', present: true },
    ])
    expect(unknown.json().error.code).toBe('BOOKING_NOT_FOUND')
    expect(await ctx.database.db.select().from(attendance)).toHaveLength(0)
  })

  it('drops marks for slots the student later removed, and when the booking is deleted', async () => {
    await book({ count: 2, slots: ['Thứ 2 18h - 20h', 'Thứ 4 18h - 20h'] })
    const ids = await bookingIds()
    await mark([
      { bookingId: ids['Minh Anh'], slot: 'Thứ 2 18h - 20h', present: true },
      { bookingId: ids['Minh Anh'], slot: 'Thứ 4 18h - 20h', present: false },
    ])

    await book({ count: 2, slots: ['Thứ 2 18h - 20h', 'Thứ 5 18h - 20h'] })
    const rows = await ctx.database.db.select().from(attendance)
    expect(rows.map((r) => r.slot)).toEqual(['Thứ 2 18h - 20h'])

    await ctx.app.inject({ method: 'DELETE', url: `/api/v1/admin/bookings/${ids['Minh Anh']}`, headers: auth })
    expect(await ctx.database.db.select().from(attendance)).toHaveLength(0)
  })
})

describe('members dashboard', () => {
  it('groups bookings per student without exposing phone or email', async () => {
    await book({ count: 2, slots: ['Thứ 2 18h - 20h', 'Thứ 4 18h - 20h'] })
    await book({ zaloName: 'Hoa', contact: 'hoa@example.com' })
    const ids = await bookingIds()
    await mark([
      { bookingId: ids['Minh Anh'], slot: 'Thứ 2 18h - 20h', present: true },
      { bookingId: ids['Minh Anh'], slot: 'Thứ 4 18h - 20h', present: false },
    ])

    // A later week for Minh Anh (same phone, different format and name spelling).
    await ctx.app.inject({ method: 'PUT', url: '/api/v1/admin/settings', headers: auth, payload: { open: false } })
    const next = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/admin/weeks',
      headers: auth,
      payload: { weekLabel: 'Tuần sau', open: true },
    })
    expect(next.statusCode).toBe(201)
    await book({ zaloName: 'Minh Anh 2', contact: '+84 912 345 678' })

    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/members' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.weekLabel).toBe('Tuần sau')
    expect(body.members).toHaveLength(2)

    const minh = body.members.find((m: { zaloName: string }) => m.zaloName === 'Minh Anh 2')
    expect(minh).toMatchObject({
      weeks: 2,
      sessions: 3,
      thisWeek: { count: 1, slots: ['Thứ 2 18h - 20h'] },
      lastWeekLabel: 'Tuần sau',
      attended: 1,
      absent: 1,
    })
    const hoa = body.members.find((m: { zaloName: string }) => m.zaloName === 'Hoa')
    expect(hoa).toMatchObject({ weeks: 1, sessions: 1, thisWeek: null, attended: 0, absent: 0 })

    const raw = res.body
    expect(raw).not.toContain('0912345678')
    expect(raw).not.toContain('hoa@example.com')
    expect(raw).not.toMatch(/contact/i)
    // No booking ids either: they're internal.
    for (const id of Object.values(ids)) expect(raw).not.toContain(id)
    expect(Object.keys(minh).sort()).toEqual([
      'absent',
      'attended',
      'firstBookedAt',
      'lastBookedAt',
      'lastWeekLabel',
      'sessions',
      'thisWeek',
      'weeks',
      'zaloName',
    ])
  })

  it('is public (no sign-in needed), but marking attendance is admin-only', async () => {
    await book()
    const ids = await bookingIds()
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/members' })).statusCode).toBe(200)

    const anonymous = await ctx.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/attendance',
      payload: { marks: [{ bookingId: ids['Minh Anh'], slot: 'Thứ 2 18h - 20h', present: false }] },
    })
    expect(anonymous.statusCode).toBe(401)
    expect(await ctx.database.db.select().from(attendance)).toHaveLength(0)
  })
})
