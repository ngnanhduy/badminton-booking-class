/**
 * Creates an admin account, or resets the password of an existing one.
 *
 *   npm run admin:create -w backend -- --email you@example.com --name "Your Name"
 *   npm run admin:create -w backend -- --email you@example.com --reset
 *
 * A random password is generated and printed once (set ADMIN_PASSWORD to choose one instead;
 * avoid typing passwords as command arguments, they end up in shell history). Uses
 * DATABASE_URL and the keys from backend/.env, so point it at Supabase to create the first
 * admin of your deployed app.
 */
import { parseArgs } from 'node:util'

import { keyringFromConfig, loadConfig } from '../src/config/env.js'
import { openDatabaseFromConfig } from '../src/db/client.js'
import { PASSWORD_MIN_LENGTH } from '../src/lib/password.js'
import { createUser, findUserIdByEmail, resetPassword } from '../src/modules/auth/auth.service.js'

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    reset: { type: 'boolean', default: false },
  },
})

if (!values.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
  console.error('Usage: npm run admin:create -w backend -- --email you@example.com --name "Your Name" [--reset]')
  process.exit(1)
}
const chosen = process.env.ADMIN_PASSWORD
if (chosen !== undefined && chosen.length < PASSWORD_MIN_LENGTH) {
  console.error(`ADMIN_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  process.exit(1)
}

const config = loadConfig()
const database = await openDatabaseFromConfig(config)
const deps = { db: database.db, keyring: keyringFromConfig(config), config }
const by = { actor: 'system' as const, actorId: null }

try {
  const existingId = await findUserIdByEmail(deps, values.email)
  if (values.reset) {
    if (!existingId) throw new Error(`No account with email ${values.email}.`)
    const password = await resetPassword(deps, existingId, by)
    console.log(`Password reset for ${values.email}. All of its sessions were signed out.`)
    console.log(`\n  Temporary password: ${password}\n`)
    console.log('Sign in and change it under Account (Tài khoản).')
  } else {
    if (existingId) throw new Error(`${values.email} already has an account. Use --reset to set a new password.`)
    const { user, temporaryPassword } = await createUser(
      deps,
      { email: values.email, name: values.name?.trim() || values.email.split('@')[0]!, password: chosen },
      by,
    )
    console.log(`Admin account created: ${user.email} (${user.name}).`)
    if (temporaryPassword) {
      console.log(`\n  Temporary password: ${temporaryPassword}\n`)
      console.log('Store it in your password manager, sign in at /dang-nhap and change it under Account.')
    }
  }
} catch (err) {
  console.error((err as Error).message)
  process.exitCode = 1
} finally {
  await database.close()
}
