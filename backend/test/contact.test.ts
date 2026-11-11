import { describe, expect, it } from 'vitest'

import { normalizeContact as backendNormalize, normalizeName } from '../src/lib/contact.js'
import { normalizeContact as frontendNormalize } from '../../frontend/src/utils/contact.js'

const cases: [string, string | null][] = [
  ['0912345678', '0912345678'],
  ['0912 345 678', '0912345678'],
  ['091.234.5678', '0912345678'],
  ['+84 912 345 678', '0912345678'],
  ['84912345678', '0912345678'],
  ['+1 (650) 555-0100', '+16505550100'],
  ['  An.Nguyen@Gmail.COM ', 'an.nguyen@gmail.com'],
  ['', null],
  ['12345', null],
  ['an@gmail', null],
  ['091234567890', null],
]

describe('normalizeContact', () => {
  it.each(cases)('normalizes %j', (input, expected) => {
    expect(backendNormalize(input)?.value ?? null).toBe(expected)
  })

  it('matches the frontend implementation exactly', () => {
    for (const [input] of cases) {
      expect(backendNormalize(input)).toEqual(frontendNormalize(input))
    }
  })
})

describe('normalizeName', () => {
  it('ignores case, spacing and Unicode composition', () => {
    expect(normalizeName('  Minh   ANH ')).toBe('minh anh')
    expect(normalizeName('Đạt')).toBe(normalizeName('Đạt'.normalize('NFD')))
  })
})
