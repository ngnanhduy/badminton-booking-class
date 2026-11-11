import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ADMIN_TOKEN, createTestApp, validBooking } from './helpers.js'

let ctx: Awaited<ReturnType<typeof createTestApp>>
const auth = { authorization: `Bearer ${ADMIN_TOKEN}` }

beforeAll(async () => {
  ctx = await createTestApp()
  await ctx.app.inject({ method: 'POST', url: '/api/v1/bookings', payload: validBooking() })
})
afterAll(() => ctx.close())

describe('admin API', () => {
  it('rejects missing or wrong tokens', async () => {
    const none = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/bookings' })
    const wrong = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/bookings',
      headers: { authorization: 'Bearer nope' },
    })
    expect(none.statusCode).toBe(401)
    expect(wrong.statusCode).toBe(401)
  })

  it('lists decrypted bookings; contacts only on request; both are audited', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/bookings', headers: auth })
    expect(res.statusCode).toBe(200)
    expect(res.json().bookings[0]).toMatchObject({ zaloName: 'Minh Anh', slots: ['Thứ 2 18h - 20h'] })
    expect(res.json().bookings[0].contact).toBeUndefined()

    const withContact = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/bookings?includeContact=true',
      headers: auth,
    })
    expect(withContact.json().bookings[0].contact).toBe('0912345678')

    const logs = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/audit-logs', headers: auth })
    const actions = logs.json().logs.map((l: { action: string }) => l.action)
    expect(actions).toContain('admin.list')
    expect(actions).toContain('admin.list_with_contact')
  })

  it('updates settings', async () => {
    const res = await ctx.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings',
      headers: auth,
      payload: { weekLabel: '16/11 - 22/11', capacity: null },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ weekLabel: '16/11 - 22/11', capacity: null, totalBookings: 0 })
  })

  it('rejects bearer tokens when ADMIN_TOKEN is unset', async () => {
    const other = await createTestApp({ ADMIN_TOKEN: '' })
    const res = await other.app.inject({ method: 'GET', url: '/api/v1/admin/bookings', headers: auth })
    expect(res.statusCode).toBe(401)
    await other.close()
  })
})
