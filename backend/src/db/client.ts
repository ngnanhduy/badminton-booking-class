import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import pg from 'pg'

import type { AppConfig } from '../config/env.js'
import { DEFAULT_SETTINGS } from './defaults.js'
import * as schema from './schema.js'
import { pgConnectionOptions, type SslMode } from './ssl.js'

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export interface Database {
  db: Db
  driver: 'postgres' | 'pglite'
  close(): Promise<void>
}

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url))

/**
 * Connects to PostgreSQL. With `url` it uses a normal PostgreSQL server; otherwise an
 * embedded PostgreSQL (PGlite) stored in `pgliteDir` ("memory://" for tests).
 * Runs pending migrations and seeds default settings.
 */
export async function openDatabase(options: {
  url?: string | undefined
  pgliteDir?: string
  ssl?: SslMode
  caCert?: string | undefined
  poolMax?: number
}): Promise<Database> {
  let database: Database

  if (options.url) {
    const { connectionString, ssl } = pgConnectionOptions(
      options.url,
      options.ssl ?? 'auto',
      options.caCert,
    )
    const pool = new pg.Pool({ connectionString, ssl, max: options.poolMax ?? 5 })
    const db = drizzlePg(pool, { schema })
    await migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER })
    database = { db: db as unknown as Db, driver: 'postgres', close: () => pool.end() }
  } else {
    const dir = options.pgliteDir ?? './data/pglite'
    if (!dir.startsWith('memory://')) mkdirSync(dir, { recursive: true })
    const client = new PGlite(dir)
    const db = drizzlePglite({ client, schema })
    await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER })
    database = { db: db as unknown as Db, driver: 'pglite', close: () => client.close() }
  }

  await database.db.insert(schema.settings).values({ id: 1, ...DEFAULT_SETTINGS }).onConflictDoNothing()
  return database
}

/** Opens the database described by the app configuration. */
export function openDatabaseFromConfig(config: AppConfig) {
  return openDatabase({
    url: config.DATABASE_URL,
    pgliteDir: config.PGLITE_DIR,
    ssl: config.DATABASE_SSL,
    caCert: config.DATABASE_CA_CERT,
    poolMax: config.DATABASE_POOL_MAX,
  })
}
