import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

/**
 * Password hashing with scrypt (memory-hard, built into Node).
 * Stored format: `scrypt$<N>$<r>$<p>$<salt>$<hash>` (base64url), so parameters can be raised
 * later without breaking existing hashes.
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const
const KEY_LENGTH = 64

export const PASSWORD_MIN_LENGTH = 10
export const PASSWORD_MAX_LENGTH = 200

function derive(password: string, salt: Buffer, options: { N: number; r: number; p: number }) {
  const scryptOptions: ScryptOptions = { ...options, maxmem: 128 * options.N * options.r * 2 }
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, scryptOptions, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  )
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, PARAMS)
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64url'), key.toString('base64url')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64url')
  const actual = await derive(password, Buffer.from(salt, 'base64url'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** A hash of a random password; verified against when the email is unknown, to equalize timing. */
let dummyHash: Promise<string> | undefined
export const dummyPasswordHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString('hex')))

/** A random password that is easy to type: 16 characters, ~96 bits. */
export function generatePassword(): string {
  return randomBytes(12).toString('base64url')
}
