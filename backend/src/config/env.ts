import { existsSync } from 'node:fs'
import { z } from 'zod'

import { createKeyring, type Keyring } from '../lib/crypto.js'
import { isValidTimeZone } from '../lib/time.js'

const base64Key = (name: string) =>
  z
    .string({ error: `${name} is required. Run: npm run keys:generate -w backend` })
    .min(1, `${name} is required. Run: npm run keys:generate -w backend`)
    .refine((v) => Buffer.from(v, 'base64').length === 32, `${name} must be 32 bytes, base64`)

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Falls back to POSTGRES_URL (set by the Vercel ↔ Supabase integration); see loadConfig. */
  DATABASE_URL: z.string().trim().optional().transform((v) => v || undefined),
  /**
   * TLS to PostgreSQL. auto = off for localhost/docker, `require` otherwise.
   * require = encrypted, certificate not verified; verify = encrypted + verified against
   * DATABASE_CA_CERT (recommended for Supabase; download the CA in the Supabase dashboard).
   */
  DATABASE_SSL: z.enum(['auto', 'disable', 'require', 'verify']).default('auto'),
  /** CA certificate for DATABASE_SSL=verify: PEM text, or a path to a .crt/.pem file. */
  DATABASE_CA_CERT: z.string().optional().transform((v) => v?.trim() || undefined),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  /**
   * Apply pending migrations when the API starts. Set to false on serverless hosts (Vercel),
   * where migrations run once during the build instead of on every cold start.
   */
  DATABASE_MIGRATE_ON_START: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  PGLITE_DIR: z.string().default('./data/pglite'),
  /** Folder with the built frontend (index.html, assets/). Set in Docker; unset in dev. */
  STATIC_DIR: z.string().optional().transform((v) => v?.trim() || undefined),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  ENCRYPTION_KEY: base64Key('ENCRYPTION_KEY'),
  ENCRYPTION_KEY_ID: z.string().regex(/^[a-zA-Z0-9]+$/).default('1'),
  ENCRYPTION_OLD_KEYS: z.string().optional().default(''),
  BLIND_INDEX_KEY: base64Key('BLIND_INDEX_KEY'),
  ADMIN_TOKEN: z
    .string()
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => !v || v.length >= 32, 'ADMIN_TOKEN must be at least 32 characters'),
  RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(180),
  PRIVACY_POLICY_VERSION: z.string().min(1).default('2026-11-12'),
  CONTROLLER_NAME: z.string().default('Lớp Cầu Lông'),
  CONTROLLER_CONTACT: z.string().default(''),
  /** Time zone the class runs in: slot times ("18h - 20h") and week dates are read in it. */
  CLASS_TIMEZONE: z
    .string()
    .default('Asia/Ho_Chi_Minh')
    .refine(isValidTimeZone, 'CLASS_TIMEZONE must be an IANA time zone, e.g. Asia/Ho_Chi_Minh'),
  /** Self check-in opens this many minutes before a class starts (and closes when it ends). */
  CHECKIN_EARLY_MINUTES: z.coerce.number().int().min(0).max(240).default(30),
  /**
   * Where the client IP (used by the rate limits) comes from behind a reverse proxy:
   *   false  = the connection itself (no proxy);
   *   number = the number of proxies in front of the app: X-Forwarded-For is read from the
   *            right, so entries a client adds itself are ignored;
   *   true   = the first X-Forwarded-For entry. Only safe where the platform replaces the
   *            header (Vercel does). Where a proxy appends to it, clients can fake their IP.
   */
  TRUST_PROXY: z
    .string()
    .trim()
    .regex(/^(true|false|\d{1,2})$/, 'TRUST_PROXY must be true, false or a number of proxies (e.g. 1)')
    .default('false')
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : Number(v))),

  // --- Admin sign-in (email + password) ---
  /**
   * The address people open in the browser. https → session cookies are Secure; its origin
   * is also accepted by the cross-site request check.
   */
  PUBLIC_URL: z
    .url({ protocol: /^https?$/, error: 'PUBLIC_URL must be an http(s) URL' })
    .default('http://localhost:5173')
    .transform((v) => v.replace(/\/+$/, '')),
  /** How long an admin stays signed in. */
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(72),
})

export type AppConfig = z.output<typeof EnvSchema>

/** Reads `.env` (if present) and validates the environment. Throws a readable error. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (env === process.env && existsSync('.env')) process.loadEnvFile('.env')
  const parsed = EnvSchema.safeParse({
    ...env,
    // The Vercel ↔ Supabase integration provides POSTGRES_URL (the pooled connection).
    DATABASE_URL: env.DATABASE_URL?.trim() || env.POSTGRES_URL,
  })
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    throw new Error(`Invalid configuration:\n${problems.join('\n')}`)
  }
  return parsed.data
}

export function keyringFromConfig(config: AppConfig): Keyring {
  return createKeyring({
    encryptionKey: config.ENCRYPTION_KEY,
    encryptionKeyId: config.ENCRYPTION_KEY_ID,
    oldKeys: config.ENCRYPTION_OLD_KEYS,
    blindIndexKey: config.BLIND_INDEX_KEY,
  })
}
