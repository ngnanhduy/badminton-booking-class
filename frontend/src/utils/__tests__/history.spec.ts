import { describe, expect, it } from 'vitest'

import type { PastSchedule } from '@/types/booking'
import { fitSchedule, type WeekAvailability } from '../history'

const MON = 'Thứ 2 18h - 20h'
const MON_LATE = 'Thứ 2 20h - 22h'
const TUE = 'Thứ 3 18h - 20h'
const THU = 'Thứ 5 18h - 20h'

const past = (slots: string[]): PastSchedule => ({
  weekLabel: '2/11 - 8/11',
  count: slots.length as 1 | 2 | 3,
  slots,
})

const week = (overrides: Partial<WeekAvailability> = {}): WeekAvailability => ({
  offered: [
    [MON, MON_LATE, TUE, THU],
    [MON, MON_LATE, TUE, THU],
    [MON, MON_LATE, TUE, THU],
  ],
  pastDays: new Set(),
  isFull: () => false,
  ...overrides,
})

describe('fitSchedule', () => {
  it('keeps an earlier schedule as it was when everything is still bookable', () => {
    expect(fitSchedule(past([MON, THU]), week())).toEqual({ slots: [MON, THU], unavailable: [] })
  })

  it('moves slots to the session that offers them this week', () => {
    const offered = [[THU], [MON], []]
    expect(fitSchedule(past([MON, THU]), week({ offered }))).toEqual({
      slots: [THU, MON],
      unavailable: [],
    })
  })

  it('leaves out slots that are gone, over, full or on a day already used', () => {
    const fit = fitSchedule(
      past(['Thứ 7 9h - 11h', MON, TUE]),
      week({ pastDays: new Set([0]), isFull: (slot) => slot === TUE }),
    )
    expect(fit.slots).toEqual(['', '', ''])
    expect(fit.unavailable).toEqual([
      { slot: 'Thứ 7 9h - 11h', reason: 'notOffered' },
      { slot: MON, reason: 'past' },
      { slot: TUE, reason: 'full' },
    ])

    // Older bookings could have two sessions on one day: only the first is kept.
    expect(fitSchedule(past([MON, MON_LATE]), week())).toEqual({
      slots: [MON, ''],
      unavailable: [{ slot: MON_LATE, reason: 'sameDay' }],
    })
  })

  it('keeps the session count and leaves the rest empty when only some slots fit', () => {
    const offered = [[MON, THU], [], []]
    expect(fitSchedule(past([MON, THU]), week({ offered }))).toEqual({
      slots: [MON, ''],
      unavailable: [{ slot: THU, reason: 'notOffered' }],
    })
  })
})
