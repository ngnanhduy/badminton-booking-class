import type { AppConfig } from './config/env.js'
import type { Db } from './db/client.js'
import type { Keyring } from './lib/crypto.js'

/** Dependencies shared by services (passed explicitly → easy to test). */
export interface AppDeps {
  db: Db
  keyring: Keyring
  config: AppConfig
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps
  }
}
