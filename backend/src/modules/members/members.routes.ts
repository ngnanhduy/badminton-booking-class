import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { listMembers } from './members.service.js'

/** `?week=<label>` picks the week shown per member (default: the current week). */
const MembersQuery = z.object({ week: z.string().trim().min(1).max(50).optional() })

/**
 * Public members dashboard: Zalo names, booked slots and attendance. Never includes
 * phone/email or notes. Marking attendance stays admin-only (PUT /admin/attendance).
 */
export const membersRoutes: FastifyPluginAsync = async (app) => {
  app.get('/members', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const { week } = MembersQuery.parse(request.query)
    return listMembers(app.deps, week)
  })
}
