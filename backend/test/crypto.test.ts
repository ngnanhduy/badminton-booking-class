import { describe, expect, it } from 'vitest'

import { blindIndex, createKeyring, decrypt, DecryptionError, encrypt, generateKey } from '../src/lib/crypto.js'

const keyring = (id = '1', key = generateKey(), oldKeys = '') =>
  createKeyring({ encryptionKey: key, encryptionKeyId: id, oldKeys, blindIndexKey: generateKey() })

describe('field encryption (AES-256-GCM)', () => {
  it('round-trips Vietnamese text and uses a fresh IV every time', () => {
    const k = keyring()
    const a = encrypt(k, 'Nguyễn Văn Đạt', 'booking:1:name')
    const b = encrypt(k, 'Nguyễn Văn Đạt', 'booking:1:name')
    expect(a).not.toBe(b)
    expect(a).not.toContain('Nguy')
    expect(decrypt(k, a, 'booking:1:name')).toBe('Nguyễn Văn Đạt')
  })

  it('rejects tampered ciphertext', () => {
    const k = keyring()
    const token = encrypt(k, '0912345678', 'booking:1:contact')
    const parts = token.split('.')
    const ct = Buffer.from(parts[3]!, 'base64url')
    ct[0]! ^= 1
    parts[3] = ct.toString('base64url')
    expect(() => decrypt(k, parts.join('.'), 'booking:1:contact')).toThrow(DecryptionError)
  })

  it('binds ciphertext to its row and column (AAD)', () => {
    const k = keyring()
    const token = encrypt(k, '0912345678', 'booking:1:contact')
    expect(() => decrypt(k, token, 'booking:2:contact')).toThrow(DecryptionError)
    expect(() => decrypt(k, token, 'booking:1:name')).toThrow(DecryptionError)
  })

  it('cannot be decrypted with another key', () => {
    const token = encrypt(keyring(), 'secret', 'aad')
    expect(() => decrypt(keyring(), token, 'aad')).toThrow(DecryptionError)
  })

  it('supports key rotation (old keys still decrypt)', () => {
    const oldKey = generateKey()
    const before = keyring('1', oldKey)
    const token = encrypt(before, 'an@gmail.com', 'aad')
    const after = keyring('2', generateKey(), `1:${oldKey}`)
    expect(decrypt(after, token, 'aad')).toBe('an@gmail.com')
    expect(encrypt(after, 'x', 'aad').split('.')[1]).toBe('2')
  })

  it('blind index is deterministic, keyed and purpose-separated', () => {
    const k = keyring()
    expect(blindIndex(k, 'contact', '0912345678')).toBe(blindIndex(k, 'contact', '0912345678'))
    expect(blindIndex(k, 'contact', '0912345678')).not.toBe(blindIndex(k, 'name', '0912345678'))
    expect(blindIndex(keyring(), 'contact', '0912345678')).not.toBe(
      blindIndex(k, 'contact', '0912345678'),
    )
  })
})
