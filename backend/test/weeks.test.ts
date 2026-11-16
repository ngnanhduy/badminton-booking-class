import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ADMIN_TOKEN, createTestApp, seededWeekLabel, validBooking } from './helpers.js'

let ctx: Awaited<ReturnType<typeof createTestApp>>
const headers = { authorization: `Bearer ${ADMIN_TOKEN}` }
const HOUR = 60 * 60 * 1000
const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString()

beforeAll(async () => {
  ctx = await createTestApp()
})
afterAll(() => ctx.close())

type Week = { id: string; weekLabel: string; open: boolean; status: string; current: boolean; bookings: number }

const book = (overrides: Record<string, unknown> = {}) =>
  ctx.app.inject({ method: 'POST', url: '/api/v1/bookings', payload: validBooking(overrides) })
const createWeek = (payload: Record<string, unknown>) =>
  ctx.app.inject({ method: 'POST', url: '/api/v1/admin/weeks', headers, payload })
const updateWeek = (id: string, payload: Record<string, unknown>) =>
  ctx.app.inject({ method: 'PUT', url: `/api/v1/admin/weeks/${id}`, headers, payload })
const listWeeks = async () =>
  (await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/weeks', headers })).json().weeks as Week[]
const schedule = async () => (await ctx.app.inject({ method: 'GET', url: '/api/v1/schedule' })).json()
const weekNamed = async (label: string) => (await listWeeks()).find((w) => w.weekLabel === label)!

describe('weeks', () => {
  it('a fresh database has the current calendar week, open', async () => {
    const weeks = await listWeeks()
    expect(weeks).toHaveLength(1)
    expect(weeks[0]).toMatchObject({ weekLabel: seededWeekLabel(), open: true, current: true, status: 'open' })
    expect(await schedule()).toMatchObject({ weekLabel: seededWeekLabel(), status: 'open' })
  })

  it('creates a closed week next to the open one; the main page keeps showing the open week', async () => {
    expect((await book()).statusCode).toBe(201)
    const res = await createWeek({ weekLabel: 'Tuần B', startDate: '2026-11-16' })
    expect(res.statusCode).toBe(201)
    expect(res.json().week).toMatchObject({ weekLabel: 'Tuần B', startDate: '2026-11-16', open: false })
    // Slots and rules were copied from the latest week.
    expect(res.json().week.slots1).toEqual((await schedule()).slots1)
    expect(res.json().config.weekLabel).toBe(seededWeekLabel())
  })

  it('refuses to open a second week while one is open', async () => {
    const b = await weekNamed('Tuần B')
    const res = await updateWeek(b.id, { open: true })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toMatchObject({ code: 'WEEK_ALREADY_OPEN', params: { week: seededWeekLabel() } })

    const created = await createWeek({ weekLabel: 'Tuần C', open: true })
    expect(created.json().error.code).toBe('WEEK_ALREADY_OPEN')
    expect((await listWeeks()).filter((w) => w.open)).toHaveLength(1)
  })

  it('after closing the open week, another can open and becomes the main page week', async () => {
    const first = await weekNamed(seededWeekLabel())
    expect((await updateWeek(first.id, { open: false })).json().config.status).toBe('closed')

    const b = await weekNamed('Tuần B')
    const res = await updateWeek(b.id, { open: true, opensAt: inHours(2) })
    expect(res.statusCode).toBe(200)
    expect(res.json().config).toMatchObject({ weekLabel: 'Tuần B', status: 'upcoming', totalBookings: 0 })

    // Bookings are refused until the opening time.
    const refused = await book({ contact: '0987 654 321', zaloName: 'Lan' })
    expect(refused.json().error.code).toBe('BOOKING_NOT_OPEN')
  })

  it('keeps the old week as history with its bookings', async () => {
    const weeks = await listWeeks()
    const old = weeks.find((w) => w.weekLabel === seededWeekLabel())!
    expect(old).toMatchObject({ open: false, current: false, bookings: 1 })
    expect(weeks.find((w) => w.current)?.weekLabel).toBe('Tuần B')

    const list = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/admin/bookings?week=${encodeURIComponent(seededWeekLabel())}`,
      headers,
    })
    expect(list.json().bookings[0].zaloName).toBe('Minh Anh')
  })

  it('a week whose closing time has passed does not block opening another', async () => {
    const b = await weekNamed('Tuần B')
    await updateWeek(b.id, { opensAt: inHours(-2), closesAt: inHours(-1) })
    expect((await schedule()).status).toBe('closed')

    const c = await createWeek({ weekLabel: 'Tuần C', open: true })
    expect(c.statusCode).toBe(201)
    expect((await weekNamed('Tuần B')).open).toBe(false)
    expect((await schedule()).weekLabel).toBe('Tuần C')
    expect((await book({ contact: 'c@example.com', zaloName: 'Cường' })).statusCode).toBe(201)
  })

  it('validates labels and registration windows', async () => {
    expect((await createWeek({ weekLabel: 'Tuần C' })).json().error.code).toBe('WEEK_EXISTS')
    const c = await weekNamed('Tuần C')
    expect((await updateWeek(c.id, { weekLabel: 'Tuần B' })).json().error.code).toBe('WEEK_EXISTS')
    const bad = await updateWeek(c.id, { opensAt: inHours(5), closesAt: inHours(4) })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error.code).toBe('WINDOW_INVALID')
    expect((await updateWeek(c.id, { startDate: '16/11/2026' })).statusCode).toBe(400)
  })

  it('renaming a week moves its bookings with it, and changes are audited', async () => {
    const c = await weekNamed('Tuần C')
    expect((await updateWeek(c.id, { weekLabel: 'Tuần C mới' })).statusCode).toBe(200)
    expect((await weekNamed('Tuần C mới')).bookings).toBe(1)
    const logs = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/audit-logs', headers })
    const actions = logs.json().logs.map((l: { action: string }) => l.action)
    expect(actions).toEqual(expect.arrayContaining(['week.create', 'week.update']))
  })

  it('shows the latest week as closed when no week is open', async () => {
    const c = await weekNamed('Tuần C mới')
    await updateWeek(c.id, { open: false })
    const s = await schedule()
    expect(s).toMatchObject({ status: 'closed', open: false })
    expect((await book({ contact: 'd@example.com', zaloName: 'Dũng' })).json().error.code).toBe('BOOKING_CLOSED')
  })

  it('requires admin access', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/admin/weeks', payload: { weekLabel: 'y' } })
    expect(res.statusCode).toBe(401)
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/weeks' })).statusCode).toBe(401)
  })
})

describe('migration from the single settings row', () => {
  it('turns the settings row and older booking weeks into week history', async () => {
    const source = fileURLToPath(new URL('../drizzle', import.meta.url))
    const partial = mkdtempSync(join(tmpdir(), 'migrations-'))
    cpSync(source, partial, { recursive: true })
    const journalPath = join(partial, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
    journal.entries = journal.entries.filter((e: { tag: string }) => e.tag < '0007')
    writeFileSync(journalPath, JSON.stringify(journal))

    const client = new PGlite('memory://')
    const db = drizzle({ client })
    try {
      // The database as it was before weeks existed.
      await migrate(db, { migrationsFolder: partial })
      await client.exec(`
        INSERT INTO settings (id, week_label, rules, slots1, slots2, capacity, open)
        VALUES (1, '9/11 - 15/11', '["r"]', '["Thứ 2 18h - 20h"]', '["Thứ 4 18h - 20h"]', 8, true);
        INSERT INTO bookings (id, week_label, name_enc, name_hash, contact_enc, contact_hash, session_count, slot1, consent_version, consent_at, created_at)
        VALUES
          ('00000000-0000-4000-8000-000000000001', '2/11 - 8/11', 'n', 'nh1', 'c', 'ch1', 1, 'Thứ 2 18h - 20h', 'v', now(), '2026-11-02'),
          ('00000000-0000-4000-8000-000000000002', '9/11 - 15/11', 'n', 'nh2', 'c', 'ch2', 1, 'Thứ 2 18h - 20h', 'v', now(), '2026-11-09');
      `)

      await migrate(db, { migrationsFolder: source })
      const { rows } = await client.query<{ label: string; open: boolean; capacity: number; slots1: string[] }>(
        'SELECT label, open, capacity, slots1 FROM weeks ORDER BY created_at',
      )
      expect(rows).toEqual([
        { label: '2/11 - 8/11', open: false, capacity: 8, slots1: ['Thứ 2 18h - 20h'] },
        { label: '9/11 - 15/11', open: true, capacity: 8, slots1: ['Thứ 2 18h - 20h'] },
      ])
      const settings = await client.query(`SELECT to_regclass('settings') AS t`)
      expect(settings.rows).toEqual([{ t: null }])
      // Bookings now have to belong to a week.
      await expect(
        client.exec(
          `INSERT INTO bookings (id, week_label, name_enc, name_hash, contact_enc, contact_hash, session_count, slot1, consent_version, consent_at)
           VALUES ('00000000-0000-4000-8000-000000000003', 'nope', 'n', 'x', 'c', 'y', 1, 's', 'v', now())`,
        ),
      ).rejects.toThrow(/foreign key/)
    } finally {
      await client.close()
      rmSync(partial, { recursive: true, force: true })
    }
  })
})

describe('editing time slots', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>
  let weekId: string
  const MON = 'Thứ 2 18h - 20h'
  const WED = 'Thứ 4 18h - 20h'

  const put = (payload: Record<string, unknown>) =>
    app.app.inject({ method: 'PUT', url: `/api/v1/admin/weeks/${weekId}`, headers, payload })
  const adminGet = async (url: string) =>
    (await app.app.inject({ method: 'GET', url: `/api/v1/admin${url}`, headers })).json()

  beforeAll(async () => {
    app = await createTestApp()
    weekId = (await adminGet('/weeks')).weeks[0].id
    for (const [zaloName, contact] of [
      ['An', 'an@example.com'],
      ['Bình', 'binh@example.com'],
    ]) {
      await app.app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        payload: validBooking({ zaloName, contact, count: 2, slots: [MON, WED] }),
      })
    }
    const an = (await adminGet('/bookings')).bookings.find((b: { zaloName: string }) => b.zaloName === 'An')
    await app.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/attendance',
      headers,
      payload: { marks: [{ bookingId: an.id, slot: MON, present: true }] },
    })
  })
  afterAll(() => app.close())

  it('lists booking counts per slot', async () => {
    const week = (await adminGet('/weeks')).weeks[0]
    expect(week.counts).toEqual({ [MON]: 2, [WED]: 2 })
  })

  it('moves bookings and attendance when a slot gets a new time', async () => {
    const week = (await adminGet('/weeks')).weeks[0]
    const swap = (s: string) => (s === MON ? 'Thứ 2 18h30 - 20h30' : s)
    const res = await put({
      slots1: week.slots1.map(swap),
      slots2: week.slots2.map(swap),
      slotRenames: [{ from: MON, to: 'Thứ 2 18h30 - 20h30' }],
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().config.counts).toEqual({ 'Thứ 2 18h30 - 20h30': 2, [WED]: 2 })
    expect((await adminGet('/attendance')).records).toEqual([
      expect.objectContaining({ slot: 'Thứ 2 18h30 - 20h30', present: true }),
    ])
  })

  it('swaps two slots without mixing them up', async () => {
    const A = 'Thứ 2 18h30 - 20h30'
    const week = (await adminGet('/weeks')).weeks[0]
    const swap = (s: string) => (s === A ? WED : s === WED ? A : s)
    const res = await put({
      slots1: week.slots1.map(swap),
      slots2: week.slots2.map(swap),
      slotRenames: [
        { from: A, to: WED },
        { from: WED, to: A },
      ],
    })
    expect(res.statusCode).toBe(200)
    const bookings = (await adminGet('/bookings')).bookings
    expect(bookings.map((b: { slots: string[] }) => b.slots)).toEqual([
      [WED, A],
      [WED, A],
    ])
    expect((await adminGet('/attendance')).records[0].slot).toBe(WED)
  })

  it('refuses renames that would merge classes or point nowhere', async () => {
    const week = (await adminGet('/weeks')).weeks[0]
    const keep = { slots1: week.slots1, slots2: week.slots2 }
    const merge = await put({ ...keep, slotRenames: [{ from: WED, to: 'Thứ 2 18h30 - 20h30' }] })
    expect(merge.statusCode).toBe(400)
    expect(merge.json().error.code).toBe('SLOT_RENAME_INVALID')
    const missing = await put({ ...keep, slotRenames: [{ from: WED, to: 'Thứ 6 6h - 8h' }] })
    expect(missing.json().error.code).toBe('SLOT_RENAME_INVALID')
    // Nothing changed.
    expect((await adminGet('/weeks')).weeks[0].counts).toEqual({ [WED]: 2, 'Thứ 2 18h30 - 20h30': 2 })
  })

  it('removing a slot keeps the bookings that used it', async () => {
    const week = (await adminGet('/weeks')).weeks[0]
    const without = (list: string[]) => list.filter((s) => s !== WED)
    const res = await put({ slots1: without(week.slots1), slots2: without(week.slots2) })
    expect(res.statusCode).toBe(200)
    expect((await adminGet('/bookings')).bookings[0].slots).toContain(WED)
  })
})

describe('a slot list per session', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>
  let weekId: string
  const MON = 'Thứ 2 18h - 20h'
  const TUE = 'Thứ 3 18h - 20h'
  const THU = 'Thứ 5 18h - 20h'

  const put = (payload: Record<string, unknown>) =>
    app.app.inject({ method: 'PUT', url: `/api/v1/admin/weeks/${weekId}`, headers, payload })
  const bookThree = (slots: string[]) =>
    app.app.inject({ method: 'POST', url: '/api/v1/bookings', payload: validBooking({ count: 3, slots }) })

  beforeAll(async () => {
    app = await createTestApp()
    weekId = (await app.app.inject({ method: 'GET', url: '/api/v1/admin/weeks', headers })).json().weeks[0].id
  })
  afterAll(() => app.close())

  it('checks session 2 and session 3 against their own lists', async () => {
    const res = await put({ slots1: [MON], slots2: [TUE], slots3: [THU] })
    expect(res.statusCode).toBe(200)
    expect(res.json().config).toMatchObject({ slots1: [MON], slots2: [TUE], slots3: [THU] })

    // Swapped: Thứ 5 is only offered for session 3, Thứ 3 only for session 2.
    const swapped = await bookThree([MON, THU, TUE])
    expect(swapped.statusCode).toBe(400)
    expect(swapped.json().error).toMatchObject({ code: 'SLOT_INVALID', params: { slot: THU } })
    expect((await bookThree([MON, TUE, THU])).statusCode).toBe(201)
  })

  it('uses the session 2 list for session 3 when a client sends only slots2', async () => {
    const res = await put({ slots2: [TUE, THU] })
    expect(res.json().week).toMatchObject({ slots2: [TUE, THU], slots3: [TUE, THU] })
    const created = await app.app.inject({
      method: 'POST',
      url: '/api/v1/admin/weeks',
      headers,
      payload: { weekLabel: 'Tuần mới', slots2: [MON] },
    })
    expect(created.json().week).toMatchObject({ slots2: [MON], slots3: [MON] })
  })

  it('migrates existing weeks with the session 2 list for session 3', async () => {
    const source = fileURLToPath(new URL('../drizzle', import.meta.url))
    const partial = mkdtempSync(join(tmpdir(), 'migrations-'))
    cpSync(source, partial, { recursive: true })
    const journalPath = join(partial, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
    journal.entries = journal.entries.filter((e: { tag: string }) => e.tag < '0009')
    writeFileSync(journalPath, JSON.stringify(journal))

    const client = new PGlite('memory://')
    const db = drizzle({ client })
    try {
      await migrate(db, { migrationsFolder: partial })
      await client.exec(`
        INSERT INTO weeks (id, label, rules, slots1, slots2)
        VALUES ('00000000-0000-4000-8000-000000000009', '9/11 - 15/11', '[]', '["${MON}"]', '["${TUE}"]');
      `)
      await migrate(db, { migrationsFolder: source })
      const { rows } = await client.query('SELECT slots2, slots3 FROM weeks')
      expect(rows).toEqual([{ slots2: [TUE], slots3: [TUE] }])
    } finally {
      await client.close()
      rmSync(partial, { recursive: true, force: true })
    }
  })

  it('migrates existing weeks with make-up classes on every slot they have', async () => {
    const source = fileURLToPath(new URL('../drizzle', import.meta.url))
    const partial = mkdtempSync(join(tmpdir(), 'migrations-'))
    cpSync(source, partial, { recursive: true })
    const journalPath = join(partial, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
    journal.entries = journal.entries.filter((e: { tag: string }) => e.tag < '0010')
    writeFileSync(journalPath, JSON.stringify(journal))

    const client = new PGlite('memory://')
    const db = drizzle({ client })
    try {
      await migrate(db, { migrationsFolder: partial })
      await client.exec(`
        INSERT INTO weeks (id, label, rules, slots1, slots2, slots3)
        VALUES ('00000000-0000-4000-8000-000000000010', '9/11 - 15/11', '[]',
                '["${MON}", "${TUE}"]', '["${TUE}", "${THU}"]', '["${MON}"]');
        INSERT INTO bookings (id, week_label, name_enc, name_hash, contact_enc, contact_hash, session_count, slot1, consent_version, consent_at)
        VALUES ('00000000-0000-4000-8000-000000000011', '9/11 - 15/11', 'n', 'nh', 'c', 'ch', 1, '${MON}', 'v', now());
      `)
      await migrate(db, { migrationsFolder: source })
      const weeks = await client.query('SELECT slots_makeup FROM weeks')
      expect(weeks.rows).toEqual([{ slots_makeup: [MON, TUE, THU] }])
      const bookings = await client.query('SELECT makeup_slot FROM bookings')
      expect(bookings.rows).toEqual([{ makeup_slot: null }])
    } finally {
      await client.close()
      rmSync(partial, { recursive: true, force: true })
    }
  })
})
