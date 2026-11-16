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

  it('rejects two sessions on the same day', () => {
    const sameDay = {
      slots1: ['Thứ 2 18h - 20h', 'Thứ 4 18h - 20h'],
      slots2: ['Thứ 2 20h - 22h', 'Thứ 4 20h - 22h', 'Chủ nhật 10h - 12h'],
    }
    expect(
      validateBooking(draft({ count: 2, slots: ['Thứ 2 18h - 20h', 'Thứ 2 20h - 22h'] }), sameDay),
    ).toEqual({ slot1: 'Buổi 1 đã chọn ngày này. Vui lòng chọn ngày khác.' })
    expect(
      validateBooking(
        draft({ count: 3, slots: ['Thứ 2 18h - 20h', 'Thứ 4 20h - 22h', 'Thứ 4 20h - 22h'] }),
        sameDay,
      ).slot2,
    ).toBe('Các buổi không được trùng ca.')
    expect(
      validateBooking(
        draft({ count: 3, slots: ['Thứ 4 18h - 20h', 'Chủ nhật 10h - 12h', 'Thứ 4 20h - 22h'] }),
        sameDay,
      ),
    ).toEqual({ slot2: 'Buổi 1 đã chọn ngày này. Vui lòng chọn ngày khác.' })
    expect(
      validateBooking(
        draft({ count: 3, slots: ['Thứ 2 18h - 20h', 'Thứ 4 20h - 22h', 'Chủ nhật 10h - 12h'] }),
        sameDay,
      ),
    ).toEqual({})
  })

  it('rejects slots not offered for that session', () => {
    const errors = validateBooking(draft({ slots: ['Thứ 3 14h - 16h'] }), config)
    expect(errors.slot0).toContain('không có trong lịch Buổi 1')
  })

  it('checks session 3 against its own list (or the session 2 list from older servers)', () => {
    const three = draft({
      count: 3,
      slots: ['Thứ 2 18h - 20h', 'Thứ 3 14h - 16h', 'Thứ 4 18h - 20h'],
    })
    expect(validateBooking(three, config)).toEqual({})
    const separate = { ...config, slots3: ['Thứ 3 14h - 16h', 'Chủ nhật 10h - 12h'] }
    expect(validateBooking(three, separate).slot2).toContain('không có trong lịch Buổi 3')
  })

  it('refuses slots on days that are over, except ones already booked', () => {
    const tuesday = { pastDays: new Set([0]) } // Monday is over
    const monday = draft({ slots: ['Thứ 2 18h - 20h'] })
    expect(validateBooking(monday, config, tuesday).slot0).toBe(
      'Ca "Thứ 2 18h - 20h" thuộc ngày đã qua. Vui lòng chọn ca khác.',
    )
    expect(validateBooking(draft({ slots: ['Thứ 4 18h - 20h'] }), config, tuesday)).toEqual({})
    // A student changing their booking may keep the Monday session they already have.
    const saved = { slots: ['Thứ 2 18h - 20h'] }
    expect(validateBooking(monday, config, { ...tuesday, saved })).toEqual({})
  })

  it('keeps sessions left as they were when changing a booking, even if no longer offered', () => {
    const [MON, TUE, WED, FRI] = ['Thứ 2 18h - 20h', 'Thứ 3 14h - 16h', 'Thứ 4 18h - 20h', 'Thứ 6 18h - 20h']
    // Booked Monday, Tuesday, Wednesday; since then Tuesday was dropped from session 2's list.
    const saved = { slots: [MON, TUE, WED] }
    const now = { slots1: [MON, FRI], slots2: [MON, WED], slots3: [MON, WED] }

    // Only session 1 changes: sessions 2 and 3 stay as they were.
    const changed = draft({ count: 3, slots: [FRI, TUE, WED] })
    expect(validateBooking(changed, now, { saved })).toEqual({})
    // A new booking can't pick Tuesday for session 2 any more…
    expect(validateBooking(changed, now).slot1).toContain('không có trong lịch Buổi 2')
    // …and neither can a session that changes (here: Tuesday moved to session 3).
    const swapped = draft({ count: 3, slots: [FRI, WED, TUE] })
    expect(validateBooking(swapped, now, { saved }).slot2).toContain('không có trong lịch Buổi 3')
  })

  describe('make-up class', () => {
    const withMakeup = { ...config, slotsMakeup: ['Thứ 4 18h - 20h', 'Thứ 5 18h - 20h'] }
    const makeup = (makeupSlot: string, overrides: Partial<BookingDraft> = {}) =>
      validateBooking(draft({ makeupEnabled: true, makeupSlot, ...overrides }), withMakeup)

    it('is only checked when ticked', () => {
      expect(validateBooking(draft({ makeupSlot: 'nope' }), withMakeup)).toEqual({})
      expect(makeup('Thứ 4 18h - 20h')).toEqual({})
    })

    it('needs a slot from the make-up list', () => {
      expect(makeup('')).toEqual({ makeup: 'Vui lòng chọn ca học bù.' })
      expect(makeup('Thứ 2 20h - 22h')).toEqual({
        makeup: 'Ca "Thứ 2 20h - 22h" không có trong lịch học bù.',
      })
    })

    it('follows the session rules: own slot, own day, not over', () => {
      const wed = { slots: ['Thứ 4 18h - 20h'] }
      expect(makeup('Thứ 4 18h - 20h', wed)).toEqual({ makeup: 'Ca này đã chọn cho Buổi 1.' })
      const sameDay = { ...withMakeup, slotsMakeup: ['Thứ 2 20h - 22h'] }
      expect(
        validateBooking(draft({ makeupEnabled: true, makeupSlot: 'Thứ 2 20h - 22h' }), sameDay),
      ).toEqual({ makeup: 'Buổi 1 đã chọn ngày này. Vui lòng chọn ngày khác.' })
      const thursdayOver = { pastDays: new Set([0, 1, 2, 3]) }
      const late = draft({ makeupEnabled: true, makeupSlot: 'Thứ 5 18h - 20h' })
      expect(validateBooking(late, withMakeup, thursdayOver).makeup).toContain('ngày đã qua')
      expect(
        validateBooking(late, withMakeup, {
          ...thursdayOver,
          saved: { slots: ['Thứ 2 18h - 20h'], makeupSlot: 'Thứ 5 18h - 20h' },
        }),
      ).toEqual({})
    })

    it('keeps a make-up class left as it was, even if no longer offered', () => {
      const saved = { slots: ['Thứ 2 18h - 20h'], makeupSlot: 'Thứ 6 18h - 20h' }
      const kept = draft({ makeupEnabled: true, makeupSlot: 'Thứ 6 18h - 20h' })
      expect(validateBooking(kept, withMakeup, { saved })).toEqual({})
      expect(validateBooking(kept, withMakeup).makeup).toContain('không có trong lịch học bù')
    })
  })

  it('passes a complete booking', () => {
    const errors = validateBooking(
      draft({ count: 2, slots: ['Thứ 4 18h - 20h', 'Thứ 3 14h - 16h', ''] }),
      config,
    )
    expect(errors).toEqual({})
  })
})
