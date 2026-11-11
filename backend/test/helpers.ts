import { buildApp } from '../src/app.js'
import { loadConfig, type AppConfig } from '../src/config/env.js'
import { openDatabase } from '../src/db/client.js'
import { generateKey } from '../src/lib/crypto.js'
import { createUser } from '../src/modules/auth/auth.service.js'

export const ADMIN_TOKEN = 'test-admin-token-0123456789abcdefghijklmnop'

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    ENCRYPTION_KEY: generateKey(),
    BLIND_INDEX_KEY: generateKey(),
    ADMIN_TOKEN,
    PGLITE_DIR: 'memory://',
    ...overrides,
  })
}

export const TEST_PASSWORD = 'correct horse battery'

/** A fresh app on an in-memory PostgreSQL (PGlite). */
export async function createTestApp(overrides: Record<string, string> = {}) {
  const config = testConfig(overrides)
  const database = await openDatabase({ pgliteDir: 'memory://' })
  const app = await buildApp({ config, database })
  const deps = app.deps
  return {
    app,
    database,
    /** Creates an admin account directly (like the admin:create script). */
    async createAdmin(email: string, name = 'Test Admin', password = TEST_PASSWORD) {
      return createUser(deps, { email, name, password }, { actor: 'system', actorId: null })
    },
    /** Logs in through the API; returns the session cookie for later requests. */
    async login(email: string, password = TEST_PASSWORD) {
      const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } })
      const sid = res.cookies.find((c) => c.name === 'sid')
      if (!sid) throw new Error(`login failed: ${res.statusCode} ${res.body}`)
      return { cookies: { sid: sid.value }, res }
    },
    async close() {
      await app.close()
      await database.close()
    },
  }
}

export const validBooking = (overrides: Record<string, unknown> = {}) => ({
  zaloName: 'Minh Anh',
  contact: '0912 345 678',
  count: 1,
  slots: ['Thứ 2 18h - 20h'],
  makeup: '',
  consent: true,
  ...overrides,
})
