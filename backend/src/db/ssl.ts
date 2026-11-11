import { existsSync, readFileSync } from 'node:fs'
import type { ConnectionOptions } from 'node:tls'

export type SslMode = 'auto' | 'disable' | 'require' | 'verify'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'db'])

/** Loads a CA certificate given as PEM text or as a file path. */
export function loadCaCert(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (value.includes('-----BEGIN CERTIFICATE-----')) return value.replace(/\\n/g, '\n')
  if (existsSync(value)) return readFileSync(value, 'utf8')
  throw new Error(`DATABASE_CA_CERT is neither PEM text nor an existing file: ${value}`)
}

/**
 * Builds the node-postgres connection string + TLS options.
 * `sslmode` in the URL is removed so these explicit settings always apply.
 */
export function pgConnectionOptions(url: string, mode: SslMode, caCert?: string) {
  const parsed = new URL(url)
  const urlMode = parsed.searchParams.get('sslmode')
  parsed.searchParams.delete('sslmode')

  let effective = mode
  if (effective === 'auto') {
    if (urlMode === 'disable') effective = 'disable'
    else effective = LOCAL_HOSTS.has(parsed.hostname) ? 'disable' : 'require'
  }

  let ssl: false | ConnectionOptions = false
  if (effective === 'require') ssl = { rejectUnauthorized: false }
  if (effective === 'verify') {
    const ca = loadCaCert(caCert)
    ssl = ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true }
  }

  return { connectionString: parsed.toString(), ssl, mode: effective }
}
