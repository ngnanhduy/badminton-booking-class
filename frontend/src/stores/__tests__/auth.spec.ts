import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { RouteLocationNormalized } from 'vue-router'

import { authGuard } from '@/router'
import { ApiError } from '@/services/errors'
import type { AuthUser } from '@/types/auth'
import { useAuthStore } from '../auth'

const server = vi.hoisted(() => ({
  user: null as AuthUser | null,
  calls: 0,
  fail: false,
}))

vi.mock('@/services/auth', () => ({
  authApi: {
    async getUser() {
      server.calls++
      if (server.fail) throw new Error('offline')
      return structuredClone(server.user)
    },
    async login(email: string, password: string) {
      if (password !== 'correct horse battery') {
        throw new ApiError('Email hoặc mật khẩu không đúng.', 401, 'INVALID_CREDENTIALS')
      }
      return { id: 'u1', email, name: 'Coach', role: 'admin' }
    },
    async logout() {
      return { ok: true }
    },
    async changePassword() {
      return { ok: true }
    },
  },
}))

const admin: AuthUser = { id: 'u1', email: 'coach@example.com', name: 'Coach', role: 'admin' }

const route = (meta: RouteLocationNormalized['meta'], fullPath = '/x') =>
  ({ meta, fullPath }) as RouteLocationNormalized

beforeEach(() => {
  setActivePinia(createPinia())
  server.user = null
  server.calls = 0
  server.fail = false
})

describe('auth store', () => {
  it('checks the session once for concurrent callers', async () => {
    server.user = admin
    const auth = useAuthStore()
    await Promise.all([auth.load(), auth.load(), auth.load()])
    await auth.load()
    expect(server.calls).toBe(1)
    expect(auth.isAdmin).toBe(true)
  })

  it('signs in and out', async () => {
    const auth = useAuthStore()
    await auth.login(' coach@example.com ', 'correct horse battery')
    expect(auth.user?.email).toBe('coach@example.com')
    await auth.logout()
    expect(auth.user).toBeNull()
  })

  it('surfaces wrong credentials as a coded API error', async () => {
    const auth = useAuthStore()
    await expect(auth.login('coach@example.com', 'nope')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    })
    expect(auth.user).toBeNull()
  })

  it('reports network errors without pretending to be signed out', async () => {
    server.fail = true
    const auth = useAuthStore()
    await auth.load()
    expect(auth.loaded).toBe(false)
    expect(auth.error).toBeTruthy()
  })
})

describe('route guard', () => {
  it('lets anyone open public pages without asking the server', async () => {
    expect(await authGuard(route({ titleKey: 'titles.schedule' }))).toBe(true)
    expect(server.calls).toBe(0)
  })

  it('sends visitors of the admin page to sign in, then back', async () => {
    expect(await authGuard(route({ roles: ['admin'] }, '/quan-tri?tab=cai-dat'))).toEqual({
      name: 'login',
      query: { returnTo: '/quan-tri?tab=cai-dat' },
    })
  })

  it('admits admins', async () => {
    server.user = admin
    expect(await authGuard(route({ roles: ['admin'] }))).toBe(true)
  })

  it('refuses users without the required role', async () => {
    // A future role (e.g. 'coach') that isn't allowed on an admin-only page.
    server.user = { ...admin, role: 'coach' as never }
    expect(await authGuard(route({ roles: ['admin'] }))).toEqual({
      name: 'login',
      query: { error: 'forbidden' },
    })
  })

  it('requires any signed-in account for the account page', async () => {
    expect(await authGuard(route({ requiresAuth: true }, '/tai-khoan'))).toMatchObject({
      name: 'login',
    })
  })
})
