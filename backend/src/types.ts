import type { AppConfig } from './config/env.js'
import type { Db } from './db/client.js'
import type { Keyring } from './lib/crypto.js'

/** Dependencies shared by services (passed explicitly → easy to test). */
export interface AppDeps {
  db: Db
  keyring: Keyring
  config: AppConfig
  /** Current time for date rules (e.g. no booking a day that is over); tests pin it. */
  now: () => Date
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps
  }
}
