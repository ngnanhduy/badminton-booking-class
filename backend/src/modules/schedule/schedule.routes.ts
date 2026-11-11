import type { FastifyPluginAsync } from 'fastify'

import { getSchedule } from './schedule.service.js'

export const scheduleRoutes: FastifyPluginAsync = async (app) => {
  /** Current week: settings, per-slot counts (no personal data) and privacy info. */
  app.get('/schedule', async () => getSchedule(app.deps.db, app.deps.config))

  app.get('/health', async () => {
    await getSchedule(app.deps.db, app.deps.config)
    return { status: 'ok' }
  })
}
