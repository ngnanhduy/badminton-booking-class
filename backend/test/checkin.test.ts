import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { slotDayIndex, slotTime } from '../src/lib/slots.js'
import { localTime, startDateFromLabel, weekLabelFor } from '../src/lib/time.js'
import { selfCheckIn } from '../src/modules/checkin/checkin.service.js'
import { ADMIN_TOKEN, createTestApp, validBooking } from './helpers.js'

let ctx: Awaited<ReturnType<typeof createTestApp>>
const headers = { authorization: `Bearer ${ADMIN_TOKEN}` }

/** A moment in Vietnam time (UTC+7) during the week of Monday 16/11/2026. */
const vn = (isoLocal: string) => new Date(`${isoLocal}+07:00`)

beforeAll(async () => {
  ctx = await createTestApp()
  // Close the seeded week and open the week of 16/11/2026 with dated slots.
  await ctx.app.inject({ method: 'PUT', url: '/api/v1/admin/settings', headers, payload: { open: false } })
  const week = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/admin/weeks',
    headers,
    payload: { weekLabel: '16/11 - 22/11', startDate: '2026-11-16', open: true },
  })
  expect(week.statusCode).toBe(201)
  await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/bookings',
    payload: validBooking({ count: 2, slots: ['Thứ 2 18h - 20h', 'Thứ 4 18h - 20h'] }),
  })
})
afterAll(() => ctx.close())

const checkIn = (at: Date, contact = '0912 345 678') => selfCheckIn(ctx.app.deps, contact, at)
const errorCode = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e: { code?: string }) => e.code,
  )

describe('time and slot helpers', () => {
  it('reads slot days and times', () => {
    expect(slotDayIndex('Thứ 2 18h - 20h')).toBe(0)
    expect(slotDayIndex('Chủ nhật 10h - 12h')).toBe(6)
    expect(slotTime('Thứ 2 18h - 20h')).toEqual({ start: 1080, end: 1200 })
    expect(slotTime('Thứ 7 9h30 - 11h')).toEqual({ start: 570, end: 660 })
    expect(slotTime('CN 22h - 0h')).toEqual({ start: 1320, end: 1440 })
    expect(slotTime('Buổi bù')).toBeNull()
  })

  it('works in the class time zone and across New Year', () => {
    expect(localTime(new Date('2026-11-16T17:30:00Z'), 'Asia/Ho_Chi_Minh')).toEqual({
      date: '2026-11-17',
      minutes: 30,
    })
    expect(weekLabelFor('2026-12-28')).toBe('28/12 - 3/1')
    expect(startDateFromLabel('29/12 - 4/1', '2027-01-02')).toBe('2026-12-29')
    expect(startDateFromLabel('31/2', '2026-01-02')).toBeNull()
  })
})

describe('self check-in', () => {
  it('opens 30 minutes before the class and closes when it ends', async () => {
    expect(await errorCode(checkIn(vn('2026-11-16T17:29')))).toBe('CHECKIN_TOO_EARLY')
    await expect(checkIn(vn('2026-11-16T17:29'))).rejects.toMatchObject({
      params: { slot: 'Thứ 2 18h - 20h', from: '17:30' },
    })
    expect(await errorCode(checkIn(vn('2026-11-16T20:01')))).toBe('CHECKIN_ENDED')
  })

  it('marks the booked session present, once', async () => {
    const first = await checkIn(vn('2026-11-16T17:30'))
    expect(first).toEqual({
      zaloName: 'Minh Anh',
      weekLabel: '16/11 - 22/11',
      slot: 'Thứ 2 18h - 20h',
      alreadyCheckedIn: false,
    })
    expect((await checkIn(vn('2026-11-16T19:59'), '+84912345678')).alreadyCheckedIn).toBe(true)

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/admin/attendance?week=${encodeURIComponent('16/11 - 22/11')}`,
      headers,
    })
    expect(res.json().records).toEqual([
      expect.objectContaining({ slot: 'Thứ 2 18h - 20h', present: true, self: true }),
    ])
    const logs = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/audit-logs', headers })
    const self = logs.json().logs.filter((l: { action: string }) => l.action === 'attendance.self_checkin')
    expect(self).toHaveLength(1)
  })

  it('overrides an absent mark, but only for today’s session', async () => {
    const id = (
      await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/admin/bookings?week=${encodeURIComponent('16/11 - 22/11')}`,
        headers,
      })
    ).json().bookings[0].id
    await ctx.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/attendance',
      headers,
      payload: { marks: [{ bookingId: id, slot: 'Thứ 4 18h - 20h', present: false }] },
    })
    expect((await checkIn(vn('2026-11-18T18:15'))).slot).toBe('Thứ 4 18h - 20h')
  })

  it('refuses days without a booked class, and unknown contacts', async () => {
    expect(await errorCode(checkIn(vn('2026-11-17T18:30')))).toBe('CHECKIN_NO_CLASS_TODAY')
    // Next Monday is in another week, which this student did not book.
    expect(await errorCode(checkIn(vn('2026-11-23T18:30')))).toBe('CHECKIN_NO_CLASS_TODAY')
    expect(await errorCode(checkIn(vn('2026-11-16T18:30'), 'someone@example.com'))).toBe(
      'CHECKIN_NO_CLASS_TODAY',
    )
  })

  it('is available over HTTP without signing in; validates the contact', async () => {
    const unknown = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/checkin',
      payload: { contact: 'nobody@example.com' },
    })
    expect(unknown.statusCode).toBe(404)
    expect(unknown.json().error.code).toBe('CHECKIN_NO_CLASS_TODAY')
    const invalid = await ctx.app.inject({ method: 'POST', url: '/api/v1/checkin', payload: { contact: 'abc' } })
    expect(invalid.statusCode).toBe(400)
  })
})
