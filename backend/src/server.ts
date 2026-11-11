import { buildApp } from './app.js'
import { loadConfig } from './config/env.js'
import { listUsers, purgeExpiredSessions } from './modules/auth/auth.service.js'
import { purgeExpiredBookings } from './modules/bookings/booking.service.js'

const config = loadConfig()

const app = await buildApp({
  config,
  logger: {
    level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    // Request bodies are never logged; also hide credentials.
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    ...(config.NODE_ENV === 'development' && {
      transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    }),
  },
})

/** Retention job: delete expired personal data at startup and every 12 hours. */
async function runRetention() {
  try {
    const deleted = await purgeExpiredBookings(app.deps)
    if (deleted) app.log.info({ deleted }, 'Retention: expired bookings deleted')
    await purgeExpiredSessions(app.deps)
  } catch (err) {
    app.log.error({ err }, 'Retention job failed')
  }
}
await runRetention()
const retentionTimer = setInterval(runRetention, 12 * 60 * 60 * 1000)
retentionTimer.unref()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info(`${signal} received, shutting down`)
    clearInterval(retentionTimer)
    await app.close()
    process.exit(0)
  })
}

await app.listen({ host: config.HOST, port: config.PORT })
app.log.info(
  `Database: ${config.DATABASE_URL ? 'PostgreSQL (DATABASE_URL)' : `embedded PGlite (${config.PGLITE_DIR})`}`,
)
if (!(await listUsers(app.deps)).length) {
  app.log.warn('No admin account yet — create one with: npm run admin:create -w backend -- --email you@example.com --name "Your Name"')
}
if (config.NODE_ENV === 'production' && !config.PUBLIC_URL.startsWith('https://')) {
  app.log.warn('PUBLIC_URL is not https — session cookies will not be marked Secure')
}
