import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../lib/password.js'
import {
  clearSessionCookie,
  currentUser,
  requireUser,
  sessionCookieName,
  sessionCookieOptions,
} from './auth.guard.js'
import { authenticate, changePassword, createSession, deleteSession } from './auth.service.js'

export const NewPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Mật khẩu cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`)
  .max(PASSWORD_MAX_LENGTH)

const LoginBody = z.object({
  email: z.string().trim().max(254),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
})

const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: NewPassword,
})

/** Slows down password guessing per IP (accounts also lock after repeated failures). */
const LOGIN_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: '15 minutes' } }

export const authRoutes: FastifyPluginAsync = async (app) => {
  const { config } = app.deps

  const publicUser = (user: { id: string; email: string; name: string; role: string }) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })

  /** Who is signed in (null for visitors). */
  app.get('/auth/me', async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    const user = await currentUser(request)
    return { user: user && publicUser(user) }
  })

  app.post('/auth/login', { config: LOGIN_RATE_LIMIT }, async (request, reply) => {
    const { email, password } = LoginBody.parse(request.body)
    const user = await authenticate(app.deps, email, password)
    const session = await createSession(app.deps, user.id)
    reply.setCookie(sessionCookieName(config), session.token, sessionCookieOptions(config, session.expiresAt))
    return { user: publicUser(user) }
  })

  app.post('/auth/logout', async (request, reply) => {
    const user = await currentUser(request)
    if (user) await deleteSession(app.deps, user.sessionId)
    clearSessionCookie(reply, config)
    return { ok: true }
  })

  /** Changes your own password; other devices are signed out. */
  app.post('/auth/password', { config: LOGIN_RATE_LIMIT }, async (request) => {
    const user = await requireUser(request)
    const body = ChangePasswordBody.parse(request.body)
    await changePassword(app.deps, user, body.currentPassword, body.newPassword)
    return { ok: true }
  })
}
