import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

/**
 * Field-level encryption for personal data.
 *
 * - Encryption: AES-256-GCM (authenticated), random 96-bit IV per value.
 *   Token format: `v1.<keyId>.<iv>.<ciphertext>.<tag>` (base64url parts).
 *   The AAD binds each ciphertext to its row and column, so values can't be
 *   copied between rows or fields without detection.
 * - Blind index: HMAC-SHA256 with a separate key, so bookings can be looked up by
 *   phone/email (equality only) without decrypting or storing the plain value.
 * - Key rotation: new data uses the current key; old keys stay available for decryption.
 */
export interface Keyring {
  currentKeyId: string
  keys: ReadonlyMap<string, Buffer>
  blindIndexKey: Buffer
}

export class DecryptionError extends Error {
  constructor(message = 'Unable to decrypt value') {
    super(message)
    this.name = 'DecryptionError'
  }
}

const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'

function decodeKey(base64: string, label: string): Buffer {
  const key = Buffer.from(base64, 'base64')
  if (key.length !== 32) throw new Error(`${label} must be a 32-byte base64 key`)
  return key
}

export function createKeyring(options: {
  encryptionKey: string
  encryptionKeyId: string
  oldKeys?: string
  blindIndexKey: string
}): Keyring {
  const keys = new Map<string, Buffer>()
  for (const entry of (options.oldKeys ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [id, key] = entry.split(':')
    if (!id || !key) throw new Error('ENCRYPTION_OLD_KEYS must look like "id:base64key,..."')
    keys.set(id, decodeKey(key, `Old key ${id}`))
  }
  keys.set(options.encryptionKeyId, decodeKey(options.encryptionKey, 'ENCRYPTION_KEY'))
  const blindIndexKey = decodeKey(options.blindIndexKey, 'BLIND_INDEX_KEY')
  if (blindIndexKey.equals(keys.get(options.encryptionKeyId)!)) {
    throw new Error('BLIND_INDEX_KEY must be different from ENCRYPTION_KEY')
  }
  return { currentKeyId: options.encryptionKeyId, keys, blindIndexKey }
}

export function encrypt(keyring: Keyring, plaintext: string, aad: string): string {
  const key = keyring.keys.get(keyring.currentKeyId)!
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, keyring.currentKeyId, iv, ciphertext, tag]
    .map((part) => (Buffer.isBuffer(part) ? part.toString('base64url') : part))
    .join('.')
}

export function decrypt(keyring: Keyring, token: string, aad: string): string {
  const [version, keyId, iv, ciphertext, tag, ...rest] = token.split('.')
  if (version !== VERSION || !keyId || !iv || ciphertext === undefined || !tag || rest.length) {
    throw new DecryptionError('Unsupported ciphertext format')
  }
  const key = keyring.keys.get(keyId)
  if (!key) throw new DecryptionError(`Unknown encryption key id "${keyId}"`)
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'))
    decipher.setAAD(Buffer.from(aad, 'utf8'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new DecryptionError('Ciphertext is corrupted, tampered with, or uses the wrong key')
  }
}

/** Deterministic keyed hash for equality lookups. `purpose` separates indexes. */
export function blindIndex(keyring: Keyring, purpose: string, value: string): string {
  return createHmac('sha256', keyring.blindIndexKey)
    .update(`${purpose}\u0000${value}`, 'utf8')
    .digest('base64url')
}

/** Generates a new random 32-byte key, base64 encoded. */
export function generateKey(): string {
  return randomBytes(32).toString('base64')
}
