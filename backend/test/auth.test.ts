import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { auditLogs, sessions, users } from '../src/db/schema.js'
import { hashPassword, verifyPassword } from '../src/lib/password.js'
import { MAX_FAILED_LOGINS } from '../src/modules/auth/auth.service.js'
import { ADMIN_TOKEN, createTestApp, TEST_PASSWORD } from './helpers.js'

const ADMIN = 'coach@example.com'

describe('password hashing', () => {
  it('verifies the right password only, with a random salt', async () => {
    const a = await hashPassword('mật khẩu dài 123')
    const b = await hashPassword('mật khẩu dài 123')
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/)
    expect(a).not.toBe(b)
    expect(await verifyPassword('mật khẩu dài 123', a)).toBe(true)
    expect(await verifyPassword('mật khẩu dài 124', a)).toBe(false)
    expect(await verifyPassword('x', 'garbage')).toBe(false)
  })
})

describe('login', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>
  beforeAll(async () => {
    ctx = await createTestApp()
    await ctx.createAdmin(ADMIN, 'Lê Văn Đạt')
  })
  afterAll(() => ctx.close())

  const me = (cookies?: Record<string, string>) =>
    ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', cookies }).then((r) => r.json())
  const login = (email: string, password: string, headers: Record<string, string> = {}) =>
    ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password }, headers })

  it('reports visitors as signed out', async () => {
    expect(await me()).toEqual({ user: null })
  })

  it('signs in with email (any case) and password, setting an httpOnly session cookie', async () => {
    const res = await login('  Coach@Example.com ', TEST_PASSWORD)
    expect(res.statusCode).toBe(200)
    expect(res.json().user).toMatchObject({ email: ADMIN, name: 'Lê Văn Đạt', role: 'admin' })
    const sid = res.cookies.find((c) => c.name === 'sid')!
    expect(sid).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' })
    expect((await me({ sid: sid.value })).user.email).toBe(ADMIN)

    // Only hashes are stored: no email, name, password or session token in plain text.
    const raw = JSON.stringify([
      ...(await ctx.database.db.select().from(users)),
      ...(await ctx.database.db.select().from(sessions)),
    ])
    for (const secret of [ADMIN, 'Lê Văn Đạt', TEST_PASSWORD, sid.value]) expect(raw).not.toContain(secret)
  })

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrong = await login(ADMIN, 'wrong password!')
    const unknown = await login('nobody@example.com', TEST_PASSWORD)
    expect(wrong.statusCode).toBe(401)
    expect(unknown.statusCode).toBe(401)
    expect(wrong.json()).toEqual(unknown.json())
    expect(wrong.json().error.code).toBe('INVALID_CREDENTIALS')
  })

  it('locks the account after repeated failures, even for the right password', async () => {
    await ctx.createAdmin('locked@example.com')
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      // Different IPs, so the per-IP rate limit doesn't interfere.
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'locked@example.com', password: 'nope' },
        remoteAddress: `10.0.0.${i + 1}`,
      })
      expect(res.statusCode).toBe(401)
    }
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'locked@example.com', password: TEST_PASSWORD },
      remoteAddress: '10.0.1.1',
    })
    expect(res.statusCode).toBe(429)
    expect(res.json().error).toMatchObject({ code: 'ACCOUNT_LOCKED', params: { minutes: 15 } })
    const logs = await ctx.database.db.select().from(auditLogs)
    expect(logs.map((l) => l.action)).toContain('auth.locked')
  })

  it('rate-limits login attempts per IP', async () => {
    const codes: number[] = []
    for (let i = 0; i < 12; i++) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'nobody@example.com', password: 'x' },
        remoteAddress: '10.9.9.9',
      })
      codes.push(res.statusCode)
    }
    expect(codes).toContain(429)
  })

  it('logs out by deleting the session', async () => {
    const { cookies } = await ctx.login(ADMIN)
    await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/logout', cookies })
    expect((await me(cookies)).user).toBeNull()
  })

  it('ignores expired sessions', async () => {
    const { cookies } = await ctx.login(ADMIN)
    await ctx.database.db.execute(sql`UPDATE sessions SET expires_at = now() - interval '1 minute'`)
    expect((await me(cookies)).user).toBeNull()
  })

  it('rejects cross-site login and writes', async () => {
    const res = await login(ADMIN, TEST_PASSWORD, { origin: 'https://evil.example' })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('BAD_ORIGIN')
    const ok = await login(ADMIN, TEST_PASSWORD, { origin: 'http://localhost:5173' })
    expect(ok.statusCode).toBe(200)
  })

  it('changes the password, keeping this session and signing out the others', async () => {
    await ctx.createAdmin('change@example.com')
    const here = (await ctx.login('change@example.com')).cookies
    const elsewhere = (await ctx.login('change@example.com')).cookies

    const wrong = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password',
      cookies: here,
      payload: { currentPassword: 'not it', newPassword: 'a brand new password' },
    })
    expect(wrong.json().error.code).toBe('WRONG_PASSWORD')

    const short = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password',
      cookies: here,
      payload: { currentPassword: TEST_PASSWORD, newPassword: 'short' },
    })
    expect(short.statusCode).toBe(400)

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password',
      cookies: here,
      payload: { currentPassword: TEST_PASSWORD, newPassword: 'a brand new password' },
    })
    expect(res.statusCode).toBe(200)
    expect((await me(here)).user).not.toBeNull()
    expect((await me(elsewhere)).user).toBeNull()
    await expect(ctx.login('change@example.com', 'a brand new password')).resolves.toBeTruthy()
  })
})

describe('admin accounts', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>
  let admin: Record<string, string>
  let adminId: string

  beforeAll(async () => {
    ctx = await createTestApp()
    adminId = (await ctx.createAdmin(ADMIN)).user.id
    admin = (await ctx.login(ADMIN)).cookies
  })
  afterAll(() => ctx.close())

  const get = (url: string, cookies?: Record<string, string>) => ctx.app.inject({ method: 'GET', url, cookies })

  it('admin API: 401 for visitors, 200 for admins', async () => {
    expect((await get('/api/v1/admin/bookings')).statusCode).toBe(401)
    expect((await get('/api/v1/admin/bookings', admin)).statusCode).toBe(200)
  })

  it('records the admin user id (not the email) in the audit log', async () => {
    await get('/api/v1/admin/bookings', admin)
    const logs = await ctx.database.db.select().from(auditLogs)
    expect(logs.some((l) => l.action === 'admin.list' && l.actorId === adminId)).toBe(true)
    expect(JSON.stringify(logs)).not.toContain(ADMIN)
  })

  it('creates an admin with a one-time temporary password that works', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      cookies: admin,
      payload: { email: 'new@example.com', name: 'New Admin' },
    })
    expect(res.statusCode).toBe(201)
    const { user, temporaryPassword } = res.json()
    expect(user).toMatchObject({ email: 'new@example.com', role: 'admin', lastLoginAt: null })
    expect(temporaryPassword).toMatch(/^[\w-]{16}$/)
    await expect(ctx.login('new@example.com', temporaryPassword)).resolves.toBeTruthy()

    const list = (await get('/api/v1/admin/users', admin)).json().users
    expect(list.map((u: { email: string }) => u.email)).toEqual([ADMIN, 'new@example.com'])
  })

  it('refuses duplicate emails', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      cookies: admin,
      payload: { email: 'NEW@example.com', name: 'Again' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('EMAIL_TAKEN')
  })

  it('resets another admin’s password and signs them out', async () => {
    const created = await ctx.createAdmin('reset@example.com')
    const theirSession = (await ctx.login('reset@example.com')).cookies
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${created.user.id}/reset-password`,
      cookies: admin,
    })
    const { temporaryPassword } = res.json()
    expect((await get('/api/v1/auth/me', theirSession)).json().user).toBeNull()
    await expect(ctx.login('reset@example.com', temporaryPassword)).resolves.toBeTruthy()

    const own = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${adminId}/reset-password`,
      cookies: admin,
    })
    expect(own.json().error.code).toBe('USE_CHANGE_PASSWORD')
  })

  it('deletes other admins, but not yourself or the last admin', async () => {
    const victim = await ctx.createAdmin('bye@example.com')
    const theirs = (await ctx.login('bye@example.com')).cookies
    const res = await ctx.app.inject({ method: 'DELETE', url: `/api/v1/admin/users/${victim.user.id}`, cookies: admin })
    expect(res.statusCode).toBe(200)
    expect((await get('/api/v1/auth/me', theirs)).json().user).toBeNull()

    const self = await ctx.app.inject({ method: 'DELETE', url: `/api/v1/admin/users/${adminId}`, cookies: admin })
    expect(self.json().error.code).toBe('CANNOT_DELETE_SELF')

    // Delete every other admin via the token, then the last one can't go.
    const users = (await get('/api/v1/admin/users', admin)).json().users as { id: string }[]
    const token = { authorization: `Bearer ${ADMIN_TOKEN}` }
    for (const u of users.filter((u) => u.id !== adminId)) {
      await ctx.app.inject({ method: 'DELETE', url: `/api/v1/admin/users/${u.id}`, headers: token })
    }
    const last = await ctx.app.inject({ method: 'DELETE', url: `/api/v1/admin/users/${adminId}`, headers: token })
    expect(last.json().error.code).toBe('LAST_ADMIN')
  })
})

describe('error responses', () => {
  it('include a code and params so clients can translate them', async () => {
    const ctx = await createTestApp()
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/bookings/lookup',
      payload: { contact: '0912345678' },
    })
    expect(res.json().error).toMatchObject({ code: 'BOOKING_NOT_FOUND', params: { week: expect.any(String) } })
    await ctx.close()
  })
})
