import type { FastifyPluginAsync } from 'fastify'

import { listMembers } from './members.service.js'

/**
 * Public members dashboard: Zalo names, booked slots and attendance totals. Never includes
 * phone/email or notes. Marking attendance stays admin-only (PUT /admin/attendance).
 */
export const membersRoutes: FastifyPluginAsync = async (app) => {
  app.get('/members', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async () =>
    listMembers(app.deps),
  )
}
