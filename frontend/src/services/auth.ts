import { appConfig } from '@/config/app'
import type { AuthUser } from '@/types/auth'
import { request } from './api'

/** Staff sign-in (email + password) and the current session; see backend/src/modules/auth. */
export const authApi = {
  async getUser(): Promise<AuthUser | null> {
    // The demo has no backend, so nobody is signed in.
    if (appConfig.demoMode) return null
    return (await request<{ user: AuthUser | null }>('/auth/me')).user
  },

  async login(email: string, password: string): Promise<AuthUser> {
    const data = await request<{ user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    return data.user
  },

  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  /** Other devices are signed out; this one stays signed in. */
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/auth/password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    }),
}
