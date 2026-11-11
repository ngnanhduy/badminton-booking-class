/**
 * Creates `backend/.env` from `.env.example` with fresh random keys.
 * If `.env` already exists it is NOT modified — new keys are printed instead
 * (replacing keys makes existing encrypted data unreadable; see README → Key rotation).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

import { generateKey } from '../src/lib/crypto.js'

const keys = {
  ENCRYPTION_KEY: generateKey(),
  BLIND_INDEX_KEY: generateKey(),
  ADMIN_TOKEN: randomBytes(32).toString('base64url'),
}

if (existsSync('.env')) {
  console.log('.env already exists — leaving it unchanged. Fresh values, if you need them:\n')
  for (const [k, v] of Object.entries(keys)) console.log(`${k}=${v}`)
  process.exit(0)
}

let env = readFileSync('.env.example', 'utf8')
for (const [k, v] of Object.entries(keys)) env = env.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`)
writeFileSync('.env', env, { mode: 0o600 })
console.log('Created backend/.env with new ENCRYPTION_KEY, BLIND_INDEX_KEY and ADMIN_TOKEN.')
console.log('Back these keys up somewhere safe (e.g. a password manager): without them the')
console.log('encrypted personal data in the database cannot be read.')
