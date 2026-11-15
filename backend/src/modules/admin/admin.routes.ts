import { desc, eq } from 'drizzle-orm'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { bookings, ROLES } from '../../db/schema.js'
import { forbidden, notFound } from '../../lib/errors.js'
import { listAttendance, markAttendance } from '../attendance/attendance.service.js'
import { audit, listAuditLogs } from '../audit/audit.service.js'
import { requireAdmin, type AdminActor } from '../auth/auth.guard.js'
import { NewPassword } from '../auth/auth.routes.js'
import { createUser, deleteUser, isValidLoginId, listUsers, resetPassword } from '../auth/auth.service.js'
import { decryptBooking, decryptContact, purgeExpiredBookings } from '../bookings/booking.service.js'
import { getSchedule } from '../schedule/schedule.service.js'
import { createWeek, getCurrentWeek, listWeeks, toWeekDto, updateWeek } from '../weeks/weeks.service.js'

/** An ISO date-time with offset ("2026-11-16T13:00:00.000Z"), or null to clear it. */
const IsoDateTime = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .nullable()

const SlotLabel = z.string().trim().min(1).max(100)

/** Settings of a week; every field optional (only the given ones change). */
const WeekFields = z
  .object({
    weekLabel: z.string().trim().min(1).max(50),
    /** First day of the week, "YYYY-MM-DD". */
    startDate: z.iso.date().nullable(),
    rules: z.array(z.string().trim().min(1).max(500)).max(20),
    slots1: z.array(SlotLabel).min(1).max(50),
    slots2: z.array(SlotLabel).min(1).max(50),
    slots3: z.array(SlotLabel).min(1).max(50),
    capacity: z.number().int().positive().nullable(),
    open: z.boolean(),
    opensAt: IsoDateTime,
    closesAt: IsoDateTime,
    /** Slots whose time changed: their bookings and attendance move to the new label. */
    slotRenames: z
      .array(z.object({ from: SlotLabel, to: SlotLabel }))
      .max(50),
  })
  .partial()

const CreateWeekBody = WeekFields.omit({ slotRenames: true }).required({ weekLabel: true })

const ListQuery = z.object({
  week: z.string().optional(),
  includeContact: z.enum(['true', 'false']).optional(),
})

const AttendanceBody = z.object({
  marks: z
    .array(
      z.object({
        bookingId: z.uuid(),
        slot: z.string().trim().min(1).max(100),
        present: z.boolean(),
      }),
    )
    .min(1)
    .max(500),
})

const CreateUserBody = z.object({
  /** Email or username (see isValidLoginId). */
  email: z
    .string()
    .trim()
    .refine(isValidLoginId, 'Email hoặc tên đăng nhập không hợp lệ (tên đăng nhập: 3–32 ký tự a-z, 0-9, . _ -).'),
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
    const week = query.week ?? (await getCurrentWeek(app.deps.db)).label
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

  /** Present/absent marks for a week's bookings (default: current week). */
  app.get('/attendance', async (request) => {
    const { week } = z.object({ week: z.string().optional() }).parse(request.query)
    const weekLabel = week ?? (await getCurrentWeek(app.deps.db)).label
    return { weekLabel, records: await listAttendance(app.deps.db, weekLabel) }
  })

  /** Marks one or more booked sessions as present (true) or absent (false). */
  app.put('/attendance', async (request) => {
    const { marks } = AttendanceBody.parse(request.body)
    return markAttendance(app.deps, marks, by(request))
  })

  /** Every week (history included), newest first, with its settings and counts. */
  app.get('/weeks', async () => ({ weeks: await listWeeks(app.deps.db) }))

  /**
   * Creates a week. Slots, rules and capacity not given are copied from the latest week.
   * With `open: true` it fails (WEEK_ALREADY_OPEN) while another week is open.
   */
  app.post('/weeks', async (request, reply) => {
    const body = CreateWeekBody.parse(request.body)
    const week = await createWeek(app.deps.db, body, by(request))
    return reply
      .status(201)
      .send({ week: toWeekDto(week), config: await getSchedule(app.deps.db, app.deps.config) })
  })

  /** Changes any week's settings, including opening or closing its registration. */
  app.put<{ Params: { id: string } }>('/weeks/:id', async (request) => {
    const id = z.uuid().parse(request.params.id)
    const week = await updateWeek(app.deps.db, id, WeekFields.parse(request.body), by(request))
    return { week: toWeekDto(week), config: await getSchedule(app.deps.db, app.deps.config) }
  })

  /** Shortcut: changes the settings of the week the public pages show. */
  app.put('/settings', async (request) => {
    const current = await getCurrentWeek(app.deps.db)
    await updateWeek(app.deps.db, current.id, WeekFields.parse(request.body), by(request))
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
