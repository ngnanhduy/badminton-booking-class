import { createHash, timingSafeEqual } from 'node:crypto'
import type { CookieSerializeOptions } from '@fastify/cookie'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import type { AppConfig } from '../../config/env.js'
import type { Role } from '../../db/schema.js'
import { forbidden, unauthorized } from '../../lib/errors.js'
import { findSessionUser, type SessionUser } from './auth.service.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** Cached result of the session lookup (undefined = not looked up yet). */
    sessionUser: SessionUser | null | undefined
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export const isSecureDeployment = (config: AppConfig) => config.PUBLIC_URL.startsWith('https://')

/** `__Host-` cookies are HTTPS-only, host-bound and path=/ (browser-enforced). */
export const sessionCookieName = (config: AppConfig) =>
  isSecureDeployment(config) ? '__Host-sid' : 'sid'

export function sessionCookieOptions(config: AppConfig, expires?: Date): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: isSecureDeployment(config),
    sameSite: 'lax',
    path: '/',
    ...(expires && { expires }),
  }
}

export function clearSessionCookie(reply: FastifyReply, config: AppConfig) {
  reply.clearCookie(sessionCookieName(config), sessionCookieOptions(config))
}

/**
 * Wires sessions into the root instance: a lazily resolved `request.sessionUser`, and an
 * Origin check that rejects cross-site writes (CSRF defence on top of SameSite=Lax). The
 * login form itself is covered too, so other sites can't log a browser into an account.
 */
export function setupSessions(app: FastifyInstance) {
  const { config } = app.deps
  const allowedOrigins = new Set([new URL(config.PUBLIC_URL).origin, ...config.CORS_ORIGINS])

  app.decorateRequest('sessionUser', undefined)

  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method)) return
    const origin = request.headers.origin
    const usesSession =
      !!request.cookies[sessionCookieName(config)] || request.url.startsWith('/api/v1/auth/')
    if (usesSession && origin && !allowedOrigins.has(origin)) {
      throw forbidden('Yêu cầu bị từ chối (nguồn không hợp lệ).', 'BAD_ORIGIN')
    }
  })
}

/** The signed-in user for this request, or null. Looked up once per request. */
export async function currentUser(request: FastifyRequest): Promise<SessionUser | null> {
  if (request.sessionUser !== undefined) return request.sessionUser
  const { deps } = request.server
  const token = request.cookies[sessionCookieName(deps.config)]
  request.sessionUser = token ? await findSessionUser(deps, token) : null
  return request.sessionUser
}

export async function requireUser(request: FastifyRequest): Promise<SessionUser> {
  const user = await currentUser(request)
  if (!user) throw unauthorized()
  return user
}

/** A signed-in user with one of the given roles (401 if signed out, 403 otherwise). */
export async function requireRole(request: FastifyRequest, roles: readonly Role[]) {
  const user = await requireUser(request)
  if (!roles.includes(user.role)) throw forbidden()
  return user
}

function sameToken(given: string, expected: string) {
  // Hash both so the comparison is constant-time regardless of length.
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export interface AdminActor {
  /** null when authenticated with ADMIN_TOKEN (scripts, curl). */
  user: SessionUser | null
  /** For the audit log: users.id or 'token'. */
  actorId: string
}

/** Admin access: a signed-in admin, or `Authorization: Bearer <ADMIN_TOKEN>` (scripts). */
export async function requireAdmin(request: FastifyRequest): Promise<AdminActor> {
  const header = request.headers.authorization
  if (header) {
    const token = request.server.deps.config.ADMIN_TOKEN
    const given = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (token && given && sameToken(given, token)) return { user: null, actorId: 'token' }
    throw unauthorized('Không có quyền truy cập.')
  }
  const user = await requireRole(request, ['admin'])
  return { user, actorId: user.id }
}
