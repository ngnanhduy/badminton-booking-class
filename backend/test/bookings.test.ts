import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { auditLogs, bookings } from '../src/db/schema.js'
import { addDays, localTime, mondayOf } from '../src/lib/time.js'
import { ADMIN_TOKEN, createTestApp, seededWeekLabel, seededWeekStart, validBooking } from './helpers.js'

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
    expect(body.weekLabel).toBe(seededWeekLabel())
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
    expect(row!.consentVersion).toBe('2026-11-12')
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
    // Two different slots on the same day are refused when booking several sessions
    const sameDay = await post(
      '/bookings',
      validBooking({ count: 2, slots: ['Thứ 2 18h - 20h', 'Thứ 2 20h - 22h'] }),
    )
    expect(sameDay.statusCode).toBe(400)
    expect(sameDay.json().error).toMatchObject({ code: 'SLOT_SAME_DAY', params: { day: 'Thứ 2' } })
    expect(
      (
        await post(
          '/bookings',
          validBooking({ count: 3, slots: ['Thứ 2 18h - 20h', 'Thứ 4 18h - 20h', 'Thứ 4 20h - 22h'] }),
        )
      ).json().error.code,
    ).toBe('SLOT_SAME_DAY')
    expect(
      (
        await post(
          '/bookings',
          validBooking({ count: 3, slots: ['Thứ 2 18h - 20h', 'Thứ 4 18h - 20h', 'Chủ nhật 10h - 12h'] }),
        )
      ).statusCode,
    ).toBe(201)
    await ctx.database.db.delete(bookings)
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
    await ctx.database.db.execute(sql`UPDATE weeks SET capacity = 1`)
    await post('/bookings', validBooking())
    const res = await post('/bookings', validBooking({ zaloName: 'Lan', contact: 'lan@example.com' }))
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('SLOT_FULL')
    await ctx.database.db.execute(sql`UPDATE weeks SET capacity = 8`)
  })

  it('rejects bookings when closed', async () => {
    await ctx.database.db.execute(sql`UPDATE weeks SET open = false`)
    const res = await post('/bookings', validBooking())
    await ctx.database.db.execute(sql`UPDATE weeks SET open = true`)
    expect(res.json().error.code).toBe('BOOKING_CLOSED')
  })
})

describe('days that are over', () => {
  let past: Awaited<ReturnType<typeof createTestApp>>
  let clock = seededWeekStart()
  const MON = 'Thứ 2 18h - 20h'
  const TUE = 'Thứ 3 18h - 20h'
  const WED = 'Thứ 4 18h - 20h'
  /** `hours` after the start of the seeded week (Monday 00:00, Vietnam time). */
  const at = (hours: number) => new Date(seededWeekStart().getTime() + hours * 3600_000)
  const book = (overrides: Record<string, unknown>) =>
    past.app.inject({ method: 'POST', url: '/api/v1/bookings', payload: validBooking(overrides) })

  beforeAll(async () => {
    past = await createTestApp({}, { now: () => clock })
  })
  afterAll(() => past.close())

  it("refuses Monday's slots on Tuesday but accepts the rest of the week", async () => {
    clock = at(24 + 9) // Tuesday 9:00
    const res = await book({ slots: [MON] })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatchObject({ code: 'SLOT_PAST', params: { slot: MON } })
    expect((await book({ count: 2, slots: [TUE, WED] })).statusCode).toBe(201) // today is still open
    // Days follow the class time zone: Tuesday 1:00 in Vietnam is still Monday in UTC.
    const lan = { zaloName: 'Lan', contact: 'lan@example.com', slots: [MON] }
    clock = at(24 + 1)
    expect((await book(lan)).json().error.code).toBe('SLOT_PAST')
    clock = at(23) // Monday 23:00: the whole day stays open
    expect((await book(lan)).statusCode).toBe(201)
  })

  it('lets a student keep a slot they already booked once its day is over', async () => {
    await past.database.db.delete(bookings)
    clock = at(9) // Monday
    expect((await book({ slots: [MON] })).statusCode).toBe(201)
    clock = at(24 + 9) // Tuesday
    expect((await book({ count: 2, slots: [MON, WED] })).statusCode).toBe(200)
    // Once dropped, it can't be picked again.
    expect((await book({ slots: [WED] })).statusCode).toBe(200)
    expect((await book({ count: 2, slots: [MON, WED] })).json().error.code).toBe('SLOT_PAST')
  })
})

describe('changing one session of a booking', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>
  const auth = { authorization: `Bearer ${ADMIN_TOKEN}` }
  const MON = 'Thứ 2 18h - 20h'
  const TUE = 'Thứ 3 18h - 20h'
  const WED = 'Thứ 4 18h - 20h'
  const THU = 'Thứ 5 18h - 20h'
  const FRI = 'Thứ 6 18h - 20h'
  const inject = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.app.inject({ method, url: `/api/v1${url}`, headers: url.startsWith('/admin') ? auth : undefined, payload })
  const book = (overrides: Record<string, unknown>) => inject('POST', '/bookings', validBooking(overrides))
  const lan = (overrides: Record<string, unknown>) => ({ zaloName: 'Lan', contact: 'lan@example.com', ...overrides })

  beforeAll(async () => {
    app = await createTestApp()
  })
  afterAll(() => app.close())

  it('keeps the sessions left as they were, even once no longer offered for them or full', async () => {
    expect((await book({ count: 3, slots: [MON, WED, FRI] })).statusCode).toBe(201)
    expect((await book(lan({ slots: [WED] }))).statusCode).toBe(201)
    // Then the admin stops offering Wednesday for session 2 and Friday for session 3, and
    // allows one place per slot (Wednesday already has two).
    const [week] = (await inject('GET', '/admin/weeks')).json().weeks
    const updated = await inject('PUT', `/admin/weeks/${week.id}`, {
      slots2: week.slots2.filter((s: string) => s !== WED),
      slots3: week.slots3.filter((s: string) => s !== FRI),
      capacity: 1,
    })
    expect(updated.statusCode).toBe(200)

    // Only session 1 changes: sessions 2 and 3 stay as they were.
    expect((await book({ count: 3, slots: [TUE, WED, FRI] })).statusCode).toBe(200)
    const lookup = await inject('POST', '/bookings/lookup', { contact: '0912345678' })
    expect(lookup.json().booking).toMatchObject({ count: 3, slots: [TUE, WED, FRI] })
    // Lan keeps her Wednesday place while adding a session.
    expect((await book(lan({ count: 2, slots: [WED, THU] }))).statusCode).toBe(200)

    // A session that does change follows the week as it is now.
    expect((await book(lan({ count: 2, slots: [THU, WED] }))).json().error).toMatchObject({
      code: 'SLOT_INVALID',
      params: { slot: WED },
    })
    expect((await book(lan({ slots: [TUE] }))).json().error).toMatchObject({
      code: 'SLOT_FULL',
      params: { slot: TUE },
    })
  })
})

describe('make-up classes', () => {
  let mk: Awaited<ReturnType<typeof createTestApp>>
  let weekId: string
  const auth = { authorization: `Bearer ${ADMIN_TOKEN}` }
  const MON = 'Thứ 2 18h - 20h'
  const WED = 'Thứ 4 18h - 20h'
  const WED_LATE = 'Thứ 4 20h - 22h'
  const FRI = 'Thứ 6 18h - 20h'
  const SUN = 'Chủ nhật 10h - 12h'
  const inject = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    mk.app.inject({ method, url: `/api/v1${url}`, headers: url.startsWith('/admin') ? auth : undefined, payload })
  const book = (overrides: Record<string, unknown>) => inject('POST', '/bookings', validBooking(overrides))
  const errorOf = async (overrides: Record<string, unknown>) => (await book(overrides)).json().error
  const minhAnh = async () =>
    (await inject('GET', '/admin/bookings')).json().bookings.find((b: { zaloName: string }) => b.zaloName === 'Minh Anh')

  beforeAll(async () => {
    mk = await createTestApp()
    weekId = (await inject('GET', '/admin/weeks')).json().weeks[0].id
    const res = await inject('PUT', `/admin/weeks/${weekId}`, { slotsMakeup: [WED, FRI] })
    expect(res.json().config.slotsMakeup).toEqual([WED, FRI])
  })
  afterAll(() => mk.close())

  it('a fresh week offers make-up classes, and new weeks copy the list', async () => {
    const fresh = await createTestApp()
    try {
      const schedule = (await fresh.app.inject({ method: 'GET', url: '/api/v1/schedule' })).json()
      expect(schedule.slotsMakeup).toContain(MON)
    } finally {
      await fresh.close()
    }
    const created = await inject('POST', '/admin/weeks', { weekLabel: 'Tuần sau' })
    expect(created.json().week.slotsMakeup).toEqual([WED, FRI])
  })

  it('books a make-up class on top of the sessions; it takes a place in its slot', async () => {
    const res = await book({ slots: [MON], makeupSlot: WED, makeup: 'Bù ca 3/11' })
    expect(res.statusCode).toBe(201)
    expect(res.json().config.counts).toEqual({ [MON]: 1, [WED]: 1 })

    const lookup = await inject('POST', '/bookings/lookup', { contact: '0912345678' })
    expect(lookup.json().booking).toMatchObject({ slots: [MON], makeupSlot: WED, makeup: 'Bù ca 3/11' })
    expect(await minhAnh()).toMatchObject({ count: 1, slots: [MON], makeupSlot: WED })
    const week = (await inject('GET', '/admin/weeks')).json().weeks.find((w: { id: string }) => w.id === weekId)
    expect(week).toMatchObject({ bookings: 1, sessions: 2, counts: { [MON]: 1, [WED]: 1 } })
    // The public members list shows it with their other classes (not labelled as make-up).
    const members = (await inject('GET', '/members')).json().members
    expect(members[0]).toMatchObject({ sessions: 2, week: { count: 2, slots: [MON, WED] } })
  })

  it('only accepts the week’s make-up slots, under the same rules as sessions', async () => {
    expect(await errorOf({ makeupSlot: SUN })).toMatchObject({ code: 'MAKEUP_SLOT_INVALID', params: { slot: SUN } })
    expect((await errorOf({ slots: [WED], makeupSlot: WED })).code).toBe('SLOT_DUPLICATE')
    expect(await errorOf({ slots: [WED_LATE], makeupSlot: WED })).toMatchObject({
      code: 'SLOT_SAME_DAY',
      params: { day: 'Thứ 4' },
    })
    // A make-up class counts against the slot's capacity like any session.
    await mk.database.db.execute(sql`UPDATE weeks SET capacity = 1`)
    try {
      const lan = { zaloName: 'Lan', contact: 'lan@example.com', slots: ['Thứ 5 18h - 20h'] }
      expect(await errorOf({ ...lan, makeupSlot: WED })).toMatchObject({ code: 'SLOT_FULL', params: { slot: WED } })
      expect(await errorOf({ ...lan, slots: [WED] })).toMatchObject({ code: 'SLOT_FULL', params: { slot: WED } })
      // The student's own make-up place doesn't count against them when they change their booking.
      expect((await book({ slots: [MON], makeupSlot: WED })).statusCode).toBe(200)
    } finally {
      await mk.database.db.execute(sql`UPDATE weeks SET capacity = 8`)
    }
  })

  it('can be marked present, follows a slot rename, and dropping it frees the place and its mark', async () => {
    const id = (await minhAnh()).id
    const marked = await inject('PUT', '/admin/attendance', { marks: [{ bookingId: id, slot: WED, present: true }] })
    expect(marked.statusCode).toBe(200)

    const week = (await inject('GET', '/admin/weeks')).json().weeks.find((w: { id: string }) => w.id === weekId)
    const later = 'Thứ 4 18h30 - 20h30'
    const swap = (list: string[]) => list.map((s) => (s === WED ? later : s))
    const renamed = await inject('PUT', `/admin/weeks/${weekId}`, {
      slots1: swap(week.slots1),
      slots2: swap(week.slots2),
      slots3: swap(week.slots3),
      slotsMakeup: swap(week.slotsMakeup),
      slotRenames: [{ from: WED, to: later }],
    })
    expect(renamed.statusCode).toBe(200)
    expect((await minhAnh()).makeupSlot).toBe(later)
    expect((await inject('GET', '/admin/attendance')).json().records).toEqual([
      expect.objectContaining({ slot: later, present: true }),
    ])

    const res = await book({ slots: [MON] })
    expect(res.statusCode).toBe(200)
    expect(res.json().config.counts).toEqual({ [MON]: 1 })
    expect((await minhAnh()).makeupSlot).toBe('')
    expect((await inject('GET', '/admin/attendance')).json().records).toEqual([])
  })

  it('an admin can stop offering make-up classes', async () => {
    const res = await inject('PUT', `/admin/weeks/${weekId}`, { slotsMakeup: [] })
    expect(res.json().config.slotsMakeup).toEqual([])
    expect((await errorOf({ makeupSlot: FRI })).code).toBe('MAKEUP_SLOT_INVALID')
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
      makeupSlot: '',
      makeup: '',
      weekLabel: seededWeekLabel(),
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

describe('booking history (suggestions on the booking form)', () => {
  let hist: Awaited<ReturnType<typeof createTestApp>>
  const auth = { authorization: `Bearer ${ADMIN_TOKEN}` }
  const MON = 'Thứ 2 18h - 20h'
  const WED = 'Thứ 4 18h - 20h'
  const FRI = 'Thứ 6 18h - 20h'
  const inject = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    hist.app.inject({
      method,
      url: `/api/v1${url}`,
      headers: url.startsWith('/admin') ? auth : undefined,
      payload,
    })
  const book = (overrides: Record<string, unknown>) => inject('POST', '/bookings', validBooking(overrides))
  const history = (contact: string) => inject('POST', '/bookings/history', { contact })

  /** Closes the open week and opens a new one starting `days` after the seeded week. */
  async function openNextWeek(weekLabel: string, days: number) {
    const all = (await inject('GET', '/admin/weeks')).json().weeks as { id: string; open: boolean }[]
    const open = all.find((w) => w.open)!
    expect((await inject('PUT', `/admin/weeks/${open.id}`, { open: false })).statusCode).toBe(200)
    const startDate = addDays(mondayOf(localTime(seededWeekStart(), 'Asia/Ho_Chi_Minh').date), days)
    const created = await inject('POST', '/admin/weeks', { weekLabel, startDate, open: true })
    expect(created.statusCode).toBe(201)
  }

  beforeAll(async () => {
    hist = await createTestApp()
  })
  afterAll(() => hist.close())

  it('returns earlier schedules newest first, once each, with no personal data', async () => {
    expect((await history('0912345678')).json()).toEqual({ history: [], bookedThisWeek: false })
    await book({ count: 2, slots: [MON, WED] })
    // This week's own booking is not history, but the form learns it exists (to load it).
    expect((await history('0912345678')).json()).toEqual({ history: [], bookedThisWeek: true })

    await openNextWeek('Tuần 2', 7)
    await book({ count: 2, slots: [WED, MON] }) // same times in another order
    await openNextWeek('Tuần 3', 14)
    await book({ slots: [FRI] })
    await book({ zaloName: 'Hoa', contact: 'hoa@example.com', slots: [MON] })
    await openNextWeek('Tuần 4', 21)
    await book({ slots: [MON] })

    const res = await history('+84 912 345 678')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      history: [
        { weekLabel: 'Tuần 3', count: 1, slots: [FRI] },
        { weekLabel: 'Tuần 2', count: 2, slots: [WED, MON] },
      ],
      bookedThisWeek: true,
    })
    expect(res.body).not.toMatch(/Minh|Hoa|0912/)

    const logs = await hist.database.db.select().from(auditLogs)
    const viewed = logs.filter((l) => l.action === 'booking.history')
    expect(viewed).toHaveLength(1)
    expect(viewed[0]).toMatchObject({ actor: 'student', detail: { weeks: 2 } })
  })

  it('rejects an invalid contact', async () => {
    const res = await history('123')
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('INVALID_CONTACT')
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
