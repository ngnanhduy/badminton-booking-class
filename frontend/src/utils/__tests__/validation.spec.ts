import { describe, expect, it } from 'vitest'

import { validateBooking, type BookingDraft } from '../validation'

const config = {
  slots1: ['Thứ 2 18h - 20h', 'Thứ 4 18h - 20h'],
  slots2: ['Thứ 2 18h - 20h', 'Thứ 3 14h - 16h', 'Thứ 4 18h - 20h'],
}

const draft = (overrides: Partial<BookingDraft>): BookingDraft => ({
  zaloName: 'An',
  contact: '0912345678',
  count: 1,
  slots: ['Thứ 2 18h - 20h'],
  ...overrides,
})

describe('validateBooking', () => {
  it('requires a name, a contact and a session count', () => {
    const errors = validateBooking(draft({ zaloName: '  ', contact: '', count: null }), config)
    expect(errors.zaloName).toBeDefined()
    expect(errors.contact).toBe('Vui lòng nhập số điện thoại hoặc email.')
    expect(errors.count).toBeDefined()
  })

  it('rejects an invalid phone number or email', () => {
    expect(validateBooking(draft({ contact: '12345' }), config).contact).toBe(
      'Số điện thoại hoặc email không hợp lệ.',
    )
    expect(validateBooking(draft({ contact: 'an@gmail' }), config).contact).toBeDefined()
    expect(validateBooking(draft({ contact: 'an@gmail.com' }), config).contact).toBeUndefined()
  })

  it('requires one slot per session', () => {
    const errors = validateBooking(draft({ count: 2, slots: ['Thứ 2 18h - 20h', ''] }), config)
    expect(errors).toEqual({ slot1: 'Vui lòng chọn ca cho Buổi 2.' })
  })

  it('rejects duplicate slots', () => {
    const errors = validateBooking(
      draft({ count: 2, slots: ['Thứ 2 18h - 20h', 'Thứ 2 18h - 20h'] }),
      config,
    )
    expect(errors.slot1).toBe('Các buổi không được trùng ca.')
  })

  it('rejects slots not offered for that session', () => {
    const errors = validateBooking(draft({ slots: ['Thứ 3 14h - 16h'] }), config)
    expect(errors.slot0).toContain('không có trong lịch Buổi 1')
  })

  it('passes a complete booking', () => {
    const errors = validateBooking(
      draft({ count: 2, slots: ['Thứ 4 18h - 20h', 'Thứ 3 14h - 16h', ''] }),
      config,
    )
    expect(errors).toEqual({})
  })
})
