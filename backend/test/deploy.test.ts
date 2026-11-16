import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { pgConnectionOptions } from '../src/db/ssl.js'
import { createTestApp, testConfig } from './helpers.js'

describe('PostgreSQL TLS options', () => {
  const supabase =
    'postgresql://postgres.abcd:p%40ss@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require'

  it('auto → TLS for remote hosts (Supabase), off for localhost', () => {
    expect(pgConnectionOptions(supabase, 'auto').ssl).toEqual({ rejectUnauthorized: false })
    expect(pgConnectionOptions('postgres://u:p@localhost:5432/db', 'auto').ssl).toBe(false)
  })

  it('removes sslmode from the URL so explicit options win, keeping the password intact', () => {
    const { connectionString } = pgConnectionOptions(supabase, 'auto')
    expect(connectionString).not.toContain('sslmode')
    expect(connectionString).toContain('p%40ss')
  })

  it('verify → certificate checked against the provided CA', () => {
    const pem = '-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----'
    expect(pgConnectionOptions(supabase, 'verify', pem).ssl).toEqual({
      rejectUnauthorized: true,
      ca: '-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----',
    })
  })
})

describe('client IP behind a proxy (rate limits)', () => {
  /**
   * 11 contact lookups (limit: 10 per 10 minutes) from one client behind one proxy, each
   * claiming another IP in a forged first X-Forwarded-For entry. Returns the status codes.
   */
  async function forgedLookups(trustProxy: string) {
    const ctx = await createTestApp({ TRUST_PROXY: trustProxy })
    const codes: number[] = []
    for (let i = 1; i <= 11; i++) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/bookings/lookup',
        payload: { contact: '0900000000' },
        remoteAddress: '10.0.0.1', // the proxy
        // The proxy appended the address it saw (198.51.100.7) to what the client sent.
        headers: { 'x-forwarded-for': `203.0.113.${i}, 198.51.100.7` },
      })
      codes.push(res.statusCode)
    }
    await ctx.close()
    return codes
  }

  it('with a number of proxies, a forged X-Forwarded-For entry does not escape the limit', async () => {
    expect(await forgedLookups('1')).toContain(429)
  })

  it('with true, the first entry wins: only for proxies that replace the header', async () => {
    expect(await forgedLookups('true')).not.toContain(429)
  })

  it('accepts true, false or a number only', () => {
    expect(testConfig({ TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2)
    expect(testConfig({ TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true)
    expect(testConfig().TRUST_PROXY).toBe(false)
    expect(() => testConfig({ TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/)
  })
})

describe('Supabase lockdown migration', () => {
  it('enables row level security on every table', async () => {
    const ctx = await createTestApp()
    const result = await ctx.database.db.execute(
      sql`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('weeks','bookings','attendance','audit_logs','users','sessions') ORDER BY relname`,
    )
    const rows = (result as unknown as { rows: { relname: string; relrowsecurity: boolean }[] }).rows
    expect(rows).toEqual([
      { relname: 'attendance', relrowsecurity: true },
      { relname: 'audit_logs', relrowsecurity: true },
      { relname: 'bookings', relrowsecurity: true },
      { relname: 'sessions', relrowsecurity: true },
      { relname: 'users', relrowsecurity: true },
      { relname: 'weeks', relrowsecurity: true },
    ])
    // The app (table owner) is not blocked by RLS.
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/schedule' })
    expect(res.statusCode).toBe(200)
    await ctx.close()
  })
})

describe('serving the frontend (single container)', () => {
  let dir: string
  let ctx: Awaited<ReturnType<typeof createTestApp>>

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'static-'))
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>app</title>')
    writeFileSync(join(dir, 'assets', 'index-abc123.js'), 'console.log(1)')
    ctx = await createTestApp({ STATIC_DIR: dir })
  })
  afterAll(async () => {
    await ctx.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('serves index.html with security headers', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<title>app</title>')
    expect(res.headers['content-security-policy']).toContain("script-src 'self'")
    expect(res.headers['content-security-policy']).not.toContain('upgrade-insecure-requests')
  })

  it('falls back to index.html for client-side routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/sua-lich' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<title>app</title>')
    expect(res.headers['cache-control']).toBe('no-cache')
  })

  it('caches hashed assets forever', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/assets/index-abc123.js' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toContain('immutable')
  })

  it('does not count static files against the API rate limit', async () => {
    for (let i = 0; i < 130; i++) {
      const res = await ctx.app.inject({ method: 'GET', url: '/assets/index-abc123.js' })
      expect(res.statusCode).toBe(200)
    }
    const api = await ctx.app.inject({ method: 'GET', url: '/api/v1/health' })
    expect(api.statusCode).toBe(200)
    expect(api.headers['x-ratelimit-remaining']).toBeDefined()
  })

  it('keeps JSON 404s for unknown API routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/nope' })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('NOT_FOUND')
  })
})

describe('database URL from the Vercel ↔ Supabase integration', () => {
  const pooled = 'postgres://postgres.abcd:pw@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require'

  it('uses POSTGRES_URL when DATABASE_URL is not set', () => {
    expect(testConfig({ POSTGRES_URL: pooled }).DATABASE_URL).toBe(pooled)
    expect(testConfig({ DATABASE_URL: '  ', POSTGRES_URL: pooled }).DATABASE_URL).toBe(pooled)
  })

  it('prefers DATABASE_URL when both are set', () => {
    const own = 'postgres://me:pw@example.com:5432/app'
    expect(testConfig({ DATABASE_URL: own, POSTGRES_URL: pooled }).DATABASE_URL).toBe(own)
  })
})
