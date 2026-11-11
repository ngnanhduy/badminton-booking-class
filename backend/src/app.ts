import { resolve } from 'node:path'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyServerOptions } from 'fastify'
import { ZodError } from 'zod'

import { keyringFromConfig, type AppConfig } from './config/env.js'
import { openDatabaseFromConfig, type Database } from './db/client.js'
import { AppError } from './lib/errors.js'
import { adminRoutes } from './modules/admin/admin.routes.js'
import { setupSessions } from './modules/auth/auth.guard.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { bookingRoutes } from './modules/bookings/booking.routes.js'
import { scheduleRoutes } from './modules/schedule/schedule.routes.js'
import './types.js'

export interface BuildAppOptions {
  config: AppConfig
  /** Reuse an open database (tests); otherwise one is opened from the config. */
  database?: Database
  logger?: FastifyServerOptions['logger']
}

export async function buildApp({ config, database, logger = false }: BuildAppOptions) {
  const app = Fastify({
    logger,
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 16 * 1024,
  })

  const db = database ?? (await openDatabaseFromConfig(config))
  if (!database) app.addHook('onClose', () => db.close())

  app.decorate('deps', { db: db.db, keyring: keyringFromConfig(config), config })

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        // HTTPS is enforced by the hosting platform; don't rewrite requests on plain-HTTP setups.
        'upgrade-insecure-requests': null,
        'img-src': ["'self'", 'data:'],
      },
    },
  })
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  })
  await app.register(cookie)
  setupSessions(app)
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    // Only the API is limited; the website's static files (JS, CSS, fonts) are not.
    allowList: (request) => !request.url.startsWith('/api/'),
    errorResponseBuilder: () =>
      new AppError(429, 'RATE_LIMITED', 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.'),
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, ...(error.params && { params: error.params }) },
      })
    }
    if (error instanceof ZodError) {
      const issue = error.issues[0]
      const message = issue?.message ?? 'Dữ liệu không hợp lệ.'
      const field = issue?.path.join('.') || undefined
      return reply
        .status(400)
        .send({ error: { code: 'VALIDATION_ERROR', message, ...(field && { params: { field } }) } })
    }
    const status = (error as { statusCode?: number }).statusCode
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ error: { code: 'BAD_REQUEST', message: 'Yêu cầu không hợp lệ.' } })
    }
    request.log.error({ err: error }, 'Unhandled error')
    return reply
      .status(500)
      .send({ error: { code: 'INTERNAL', message: 'Máy chủ gặp lỗi, vui lòng thử lại sau.' } })
  })

  await app.register(authRoutes, { prefix: '/api/v1' })
  await app.register(scheduleRoutes, { prefix: '/api/v1' })
  await app.register(bookingRoutes, { prefix: '/api/v1' })
  await app.register(adminRoutes, { prefix: '/api/v1/admin' })

  // Serve the built Vue app (single-container deployment).
  const staticRoot = config.STATIC_DIR ? resolve(config.STATIC_DIR) : undefined
  if (staticRoot) {
    await app.register(fastifyStatic, {
      root: staticRoot,
      setHeaders(res, filePath) {
        // Hashed build assets never change; HTML must always be revalidated.
        res.header(
          'Cache-Control',
          /[\\/]assets[\\/]/.test(filePath) ? 'public, max-age=31536000, immutable' : 'no-cache',
        )
      },
    })
  }

  app.setNotFoundHandler((request, reply) => {
    const isApi = request.url.startsWith('/api/')
    if (staticRoot && !isApi && request.method === 'GET') {
      // SPA fallback: let Vue Router handle client-side routes like /sua-lich.
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html')
    }
    return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy.' } })
  })

  return app
}
