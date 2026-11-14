/**
 * Vercel serverless entry: runs the Fastify API (built to backend/dist) for every /api/* request.
 * The Vue frontend is served by Vercel as static files (frontend/dist).
 *
 * Migrations run during the Vercel build (scripts/vercel-build.sh), not here:
 * set DATABASE_MIGRATE_ON_START=false in the Vercel project.
 */
import { buildApp } from '../backend/dist/app.js'
import { loadConfig } from '../backend/dist/config/env.js'
import { purgeExpiredSessions } from '../backend/dist/modules/auth/auth.service.js'
import { purgeExpiredBookings } from '../backend/dist/modules/bookings/booking.service.js'

/** One Fastify instance per warm function instance, created on the first request. */
let appPromise

function getApp() {
  appPromise ??= (async () => {
    const config = loadConfig()
    if (!config.DATABASE_URL) {
      throw new Error('DATABASE_URL is required on Vercel (the embedded PGlite database cannot be used).')
    }
    const app = await buildApp({
      config,
      logger: { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie'] },
    })
    await app.ready()
    return app
  })().catch((err) => {
    appPromise = undefined // retry on the next request
    throw err
  })
  return appPromise
}

/** Daily retention job, called by Vercel Cron (see `crons` in vercel.json). */
async function runRetention(app, req, res) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.statusCode = 401
    return res.end()
  }
  const deleted = await purgeExpiredBookings(app.deps)
  await purgeExpiredSessions(app.deps)
  app.log.info({ deleted }, 'Retention: expired bookings deleted')
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ deleted }))
}

export default async function handler(req, res) {
  try {
    const app = await getApp()
    if (req.url?.split('?')[0] === '/api/cron/retention') return await runRetention(app, req, res)
    app.server.emit('request', req, res)
  } catch (err) {
    console.error(err)
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { code: 'INTERNAL', message: 'Máy chủ gặp lỗi, vui lòng thử lại sau.' } }))
    }
  }
}
