import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { requirePage } from '../pages/pages.service.js'
import { listMembers } from './members.service.js'

/** `?week=<label>` picks the week shown per member (default: the current week). */
export const MembersQuery = z.object({ week: z.string().trim().min(1).max(50).optional() })

/**
 * Public members dashboard: Zalo names, booked slots and attendance. Never includes
 * phone/email or notes. Marking attendance stays admin-only (PUT /admin/attendance), and so
 * does the same list with phone/email (GET /admin/members). Off with the members page.
 */
export const membersRoutes: FastifyPluginAsync = async (app) => {
  app.get('/members', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    await requirePage(request, 'members')
    const { week } = MembersQuery.parse(request.query)
    return listMembers(app.deps, week)
  })
}
