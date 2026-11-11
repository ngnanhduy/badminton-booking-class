import { desc, eq } from 'drizzle-orm'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { bookings, ROLES, settings } from '../../db/schema.js'
import { forbidden, notFound } from '../../lib/errors.js'
import { audit, listAuditLogs } from '../audit/audit.service.js'
import { requireAdmin, type AdminActor } from '../auth/auth.guard.js'
import { NewPassword } from '../auth/auth.routes.js'
import { createUser, deleteUser, listUsers, resetPassword } from '../auth/auth.service.js'
import { decryptBooking, decryptContact, purgeExpiredBookings } from '../bookings/booking.service.js'
import { getSchedule, getSettings } from '../schedule/schedule.service.js'

const SettingsBody = z
  .object({
    weekLabel: z.string().trim().min(1).max(50),
    rules: z.array(z.string().trim().min(1).max(500)).max(20),
    slots1: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
    slots2: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
    capacity: z.number().int().positive().nullable(),
    open: z.boolean(),
  })
  .partial()

const ListQuery = z.object({
  week: z.string().optional(),
  includeContact: z.enum(['true', 'false']).optional(),
})

const CreateUserBody = z.object({
  email: z.email('Email không hợp lệ.').max(254),
  name: z.string().trim().min(1).max(100),
  password: NewPassword.optional(),
  role: z.enum(ROLES).optional(),
})

declare module 'fastify' {
  interface FastifyRequest {
    admin: AdminActor
  }
}

/**
 * Admin API. Allowed for signed-in admins, or with
 * `Authorization: Bearer <ADMIN_TOKEN>` (scripts). Every access to personal data is
 * written to the audit log.
 */
export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.decorateRequest('admin', null as unknown as AdminActor)
  app.addHook('onRequest', async (request) => {
    request.admin = await requireAdmin(request)
  })

  const by = (request: FastifyRequest) => ({ actor: 'admin' as const, actorId: request.admin.actorId })

  /** Decrypted bookings for a week (default: current). Contact only with includeContact=true. */
  app.get('/bookings', async (request) => {
    const query = ListQuery.parse(request.query)
    const week = query.week ?? (await getSettings(app.deps.db)).weekLabel
    const rows = await app.deps.db
      .select()
      .from(bookings)
      .where(eq(bookings.weekLabel, week))
      .orderBy(desc(bookings.createdAt))
    const withContact = query.includeContact === 'true'
    await audit(app.deps.db, {
      ...by(request),
      action: withContact ? 'admin.list_with_contact' : 'admin.list',
      weekLabel: week,
      detail: { rows: rows.length },
    })
    return {
      weekLabel: week,
      bookings: rows.map((row) => ({
        ...decryptBooking(app.deps.keyring, row),
        ...(withContact ? { contact: decryptContact(app.deps.keyring, row) } : {}),
      })),
    }
  })

  app.delete<{ Params: { id: string } }>('/bookings/:id', async (request) => {
    const id = z.uuid().parse(request.params.id)
    const deleted = await app.deps.db
      .delete(bookings)
      .where(eq(bookings.id, id))
      .returning({ id: bookings.id, weekLabel: bookings.weekLabel })
    if (!deleted[0]) throw notFound('BOOKING_NOT_FOUND', 'Không tìm thấy đăng ký.')
    await audit(app.deps.db, {
      ...by(request),
      action: 'booking.delete',
      bookingId: id,
      weekLabel: deleted[0].weekLabel,
    })
    return { deleted: true, config: await getSchedule(app.deps.db, app.deps.config) }
  })

  /** Update class settings (week, rules, slots, capacity, open). */
  app.put('/settings', async (request) => {
    const body = SettingsBody.parse(request.body)
    await app.deps.db
      .update(settings)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(settings.id, 1))
    await audit(app.deps.db, {
      ...by(request),
      action: 'settings.update',
      detail: { fields: Object.keys(body) },
    })
    return getSchedule(app.deps.db, app.deps.config)
  })

  /** Admin accounts. */
  app.get('/users', async (request) => {
    const list = await listUsers(app.deps)
    await audit(app.deps.db, { ...by(request), action: 'admin.users_list', detail: { rows: list.length } })
    return { users: list }
  })

  /** Adds an admin. Without a password, a temporary one is generated and returned once. */
  app.post('/users', async (request, reply) => {
    const body = CreateUserBody.parse(request.body)
    const result = await createUser(app.deps, body, by(request))
    return reply.status(201).send(result)
  })

  /** Replaces a user's password with a temporary one (returned once) and signs them out. */
  app.post<{ Params: { id: string } }>('/users/:id/reset-password', async (request) => {
    const id = z.uuid().parse(request.params.id)
    if (request.admin.user?.id === id) {
      throw forbidden('Hãy dùng chức năng đổi mật khẩu cho tài khoản của bạn.', 'USE_CHANGE_PASSWORD')
    }
    return { temporaryPassword: await resetPassword(app.deps, id, by(request)) }
  })

  app.delete<{ Params: { id: string } }>('/users/:id', async (request) => {
    const id = z.uuid().parse(request.params.id)
    await deleteUser(app.deps, id, by(request))
    return { deleted: true }
  })

  app.get('/audit-logs', async (request) => {
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(1000).default(100) })
      .parse(request.query)
    return { logs: await listAuditLogs(app.deps.db, limit) }
  })

  app.post('/retention/purge', async () => ({
    deleted: await purgeExpiredBookings(app.deps, 'admin'),
  }))
}
