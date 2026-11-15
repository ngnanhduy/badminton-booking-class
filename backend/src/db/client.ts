import { randomUUID } from 'node:crypto'
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
import { localTime, mondayOf, weekLabelFor } from '../lib/time.js'
import { DEFAULT_WEEK } from './defaults.js'
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
 * Runs pending migrations and seeds a first week.
 */
export async function openDatabase(options: {
  url?: string | undefined
  pgliteDir?: string
  ssl?: SslMode
  caCert?: string | undefined
  poolMax?: number
  /** Run pending migrations and seed a first week (default true). */
  migrate?: boolean
  /** Class time zone, used to date the first week. */
  timeZone?: string
}): Promise<Database> {
  const migrate = options.migrate ?? true
  let database: Database

  if (options.url) {
    const { connectionString, ssl } = pgConnectionOptions(
      options.url,
      options.ssl ?? 'auto',
      options.caCert,
    )
    const pool = new pg.Pool({ connectionString, ssl, max: options.poolMax ?? 5 })
    const db = drizzlePg(pool, { schema })
    if (migrate) await migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER })
    database = { db: db as unknown as Db, driver: 'postgres', close: () => pool.end() }
  } else {
    const dir = options.pgliteDir ?? './data/pglite'
    if (!dir.startsWith('memory://')) mkdirSync(dir, { recursive: true })
    const client = new PGlite(dir)
    const db = drizzlePglite({ client, schema })
    await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER })
    database = { db: db as unknown as Db, driver: 'pglite', close: () => client.close() }
  }

  // The embedded database is always migrated (it is local and private to this process).
  if (migrate || database.driver === 'pglite') {
    await seedFirstWeek(database.db, options.timeZone ?? 'Asia/Ho_Chi_Minh')
  }
  return database
}

/** On an empty database, opens registration for the current calendar week. */
async function seedFirstWeek(db: Db, timeZone: string) {
  const [any] = await db.select({ id: schema.weeks.id }).from(schema.weeks).limit(1)
  if (any) return
  const monday = mondayOf(localTime(new Date(), timeZone).date)
  await db
    .insert(schema.weeks)
    .values({ id: randomUUID(), label: weekLabelFor(monday), startDate: monday, ...DEFAULT_WEEK, open: true })
    .onConflictDoNothing()
}

/** Opens the database described by the app configuration. */
export function openDatabaseFromConfig(config: AppConfig, overrides: { migrate?: boolean } = {}) {
  return openDatabase({
    migrate: overrides.migrate ?? config.DATABASE_MIGRATE_ON_START,
    url: config.DATABASE_URL,
    pgliteDir: config.PGLITE_DIR,
    ssl: config.DATABASE_SSL,
    caCert: config.DATABASE_CA_CERT,
    poolMax: config.DATABASE_POOL_MAX,
    timeZone: config.CLASS_TIMEZONE,
  })
}
