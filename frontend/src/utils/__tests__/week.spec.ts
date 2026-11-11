import { describe, expect, it } from 'vitest'

import { slotDate, weekStartDate } from '../week'

const today = new Date(2026, 10, 10) // 10 Nov 2026

describe('week dates', () => {
  it('finds the Monday of the week label', () => {
    expect(weekStartDate('9/11 - 15/11', today)).toEqual(new Date(2026, 10, 9))
  })

  it('returns the calendar date for each weekday', () => {
    expect(slotDate('9/11 - 15/11', 0, today)).toBe('9/11')
    expect(slotDate('9/11 - 15/11', 6, today)).toBe('15/11')
  })

  it('handles weeks that cross into a new year', () => {
    const lateDecember = new Date(2026, 11, 28)
    expect(slotDate('28/12 - 3/1', 4, lateDecember)).toBe('1/1')
    expect(weekStartDate('4/1 - 10/1', lateDecember)).toEqual(new Date(2027, 0, 4))
  })

  it('returns empty for unknown labels or days', () => {
    expect(slotDate('Tuần này', 0, today)).toBe('')
    expect(slotDate('9/11 - 15/11', 7, today)).toBe('')
  })
})
