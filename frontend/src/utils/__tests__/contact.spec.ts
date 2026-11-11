import { describe, expect, it } from 'vitest'

import { maskContact, normalizeContact } from '../contact'

describe('normalizeContact', () => {
  it.each([
    ['0912345678', '0912345678'],
    ['0912 345 678', '0912345678'],
    ['091.234.5678', '0912345678'],
    ['+84 912 345 678', '0912345678'],
    ['84912345678', '0912345678'],
    ['+1 (650) 555-0100', '+16505550100'],
  ])('normalizes phone %s', (input, expected) => {
    expect(normalizeContact(input)).toEqual({ kind: 'phone', value: expected })
  })

  it('lowercases and trims emails', () => {
    expect(normalizeContact('  An.Nguyen@Gmail.COM ')).toEqual({
      kind: 'email',
      value: 'an.nguyen@gmail.com',
    })
  })

  it.each(['', '12345', 'abc', 'an@gmail', '091234567890', 'an @gmail.com'])(
    'rejects %j',
    (input) => {
      expect(normalizeContact(input)).toBeNull()
    },
  )
})

describe('maskContact', () => {
  it('hides the middle of phone numbers and emails', () => {
    expect(maskContact('0912 345 678')).toBe('091•••••78')
    expect(maskContact('nguyenan@gmail.com')).toBe('ng••••••@gmail.com')
  })
})
