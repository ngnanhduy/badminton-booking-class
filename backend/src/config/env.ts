import { existsSync } from 'node:fs'
import { z } from 'zod'

import { createKeyring, type Keyring } from '../lib/crypto.js'

const base64Key = (name: string) =>
  z
    .string({ error: `${name} is required. Run: npm run keys:generate -w backend` })
    .min(1, `${name} is required. Run: npm run keys:generate -w backend`)
    .refine((v) => Buffer.from(v, 'base64').length === 32, `${name} must be 32 bytes, base64`)

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
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
  PRIVACY_POLICY_VERSION: z.string().min(1).default('2026-11-10'),
  CONTROLLER_NAME: z.string().default('Lớp Cầu Lông'),
  CONTROLLER_CONTACT: z.string().default(''),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

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
  const parsed = EnvSchema.safeParse(env)
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
