import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ADMIN_TOKEN, createTestApp, validBooking } from './helpers.js'

let ctx: Awaited<ReturnType<typeof createTestApp>>
const auth = { authorization: `Bearer ${ADMIN_TOKEN}` }

beforeAll(async () => {
  ctx = await createTestApp()
})
afterAll(() => ctx.close())

const setPages = (payload: Record<string, unknown>, headers: Record<string, string> = auth) =>
  ctx.app.inject({ method: 'PUT', url: '/api/v1/admin/pages', headers, payload })

const contact = { contact: '0912 345 678' }

describe('turning public pages on and off', () => {
  it('has every page on by default', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/schedule' })
    expect(res.json().pages).toEqual({
      booking: true,
      edit: true,
      checkin: true,
      schedule: true,
      members: true,
    })
  })

  it('is admin-only and only takes known pages with true/false', async () => {
    expect((await setPages({ members: false }, {})).statusCode).toBe(401)
    expect((await setPages({ admin: false })).statusCode).toBe(400)
    expect((await setPages({ members: 'off' })).statusCode).toBe(400)
  })

  it('changes only the given pages, returns the new schedule and is audited', async () => {
    const res = await setPages({ members: false, checkin: false })
    expect(res.statusCode).toBe(200)
    expect(res.json().pages).toMatchObject({ members: false, checkin: false, booking: true, edit: true })

    const again = await setPages({ checkin: true })
    expect(again.json().pages).toMatchObject({ members: false, checkin: true })

    const logs = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/audit-logs', headers: auth })
    expect(logs.json().logs).toContainEqual(
      expect.objectContaining({ action: 'pages.update', detail: { checkin: true } }),
    )
    await setPages({ members: true })
  })

  it("refuses a turned-off page's endpoints to the public", async () => {
    await setPages({ members: false, checkin: false, booking: false })
    try {
      const members = await ctx.app.inject({ method: 'GET', url: '/api/v1/members' })
      expect(members.statusCode).toBe(403)
      expect(members.json().error.code).toBe('PAGE_DISABLED')

      for (const [url, payload] of [
        ['/api/v1/checkin', contact],
        ['/api/v1/bookings', validBooking()],
        ['/api/v1/bookings/history', contact],
      ] as const) {
        const res = await ctx.app.inject({ method: 'POST', url, payload })
        expect(res.statusCode, url).toBe(403)
        expect(res.json().error.code, url).toBe('PAGE_DISABLED')
      }
    } finally {
      await setPages({ members: true, checkin: true, booking: true })
    }
  })

  it('keeps lookup while either page using it is on, and delete always', async () => {
    const lookup = () => ctx.app.inject({ method: 'POST', url: '/api/v1/bookings/lookup', payload: contact })
    await setPages({ booking: false })
    try {
      // Edit page still on: not found (no booking), not refused.
      expect((await lookup()).statusCode).toBe(404)
      await setPages({ edit: false })
      expect((await lookup()).json().error.code).toBe('PAGE_DISABLED')

      // Right to erasure: answered as usual (no booking to delete here).
      const del = await ctx.app.inject({ method: 'POST', url: '/api/v1/bookings/delete', payload: contact })
      expect(del.statusCode).toBe(404)
      expect(del.json().error.code).toBe('BOOKING_NOT_FOUND')
    } finally {
      await setPages({ booking: true, edit: true })
    }
  })

  it('lets signed-in admins use turned-off pages', async () => {
    await ctx.createAdmin('pages-admin@example.com')
    const { cookies } = await ctx.login('pages-admin@example.com')
    await setPages({ members: false })
    try {
      const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/members', cookies })
      expect(res.statusCode).toBe(200)
    } finally {
      await setPages({ members: true })
    }
  })
})
