import { describe, expect, it } from 'vitest'

import { ApiError, errorMessage } from '@/services/errors'
import { dayName, timeRange } from '../format'
import { currentLocale, setLocale } from '../index'
import en from '../locales/en'
import vi from '../locales/vi'
import { parseSlot } from '@/utils/slots'
import { validateBooking } from '@/utils/validation'

/** Every leaf path of a messages object, e.g. "auth.login" or "days.long.0". */
function keys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix]
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
}

describe('i18n', () => {
  it('has the same keys in English and Vietnamese', () => {
    expect(keys(en).sort()).toEqual(keys(vi).sort())
  })

  it('defaults to Vietnamese and remembers the choice', () => {
    expect(currentLocale()).toBe('vi')
    setLocale('en')
    expect(currentLocale()).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(localStorage.getItem('badminton:locale')).toBe('en')
  })

  it('translates API errors by code, with parameters', () => {
    const error = new ApiError('Ca "Thứ 2 18h - 20h" đã đủ người…', 409, 'SLOT_FULL', {
      slot: 'Thứ 2 18h - 20h',
    })
    expect(errorMessage(error)).toBe('Ca "Thứ 2 18h - 20h" đã đủ người, vui lòng chọn ca khác.')
    setLocale('en')
    expect(errorMessage(error)).toBe('"Thứ 2 18h - 20h" is full, please choose another slot.')
    expect(errorMessage(new ApiError('x', 0, 'NETWORK'))).toContain("Can't reach the server")
  })

  it('falls back to the server message for unknown codes', () => {
    expect(errorMessage(new ApiError('Lỗi lạ', 418, 'TEAPOT'))).toBe('Lỗi lạ')
  })

  it('shows Vietnamese slot labels in the current language', () => {
    const slot = parseSlot('Chủ nhật 9h30 - 11h')
    expect([dayName(slot), dayName(slot, 'short'), timeRange(slot)]).toEqual([
      'Chủ nhật',
      'CN',
      '9h30 – 11h',
    ])
    setLocale('en')
    expect([dayName(slot), dayName(slot, 'short'), timeRange(slot)]).toEqual([
      'Sunday',
      'Sun',
      '09:30 – 11:00',
    ])
  })

  it('validates in the current language', () => {
    setLocale('en')
    const errors = validateBooking(
      { zaloName: '', contact: '', count: 1, slots: [''] },
      { slots1: [], slots2: [] },
    )
    expect(errors).toMatchObject({
      zaloName: 'Please enter your Zalo name.',
      contact: 'Please enter a phone number or email.',
      slot0: 'Please choose a slot for session 1.',
    })
  })
})
