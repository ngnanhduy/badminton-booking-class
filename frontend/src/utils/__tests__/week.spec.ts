import { describe, expect, it } from 'vitest'

import {
  fromLocalInput,
  mondayOf,
  nextWeekStart,
  slotDate,
  startDateOf,
  toLocalInput,
  weekLabelFromStart,
  weekStartDate,
} from '../week'

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

describe('new week suggestions', () => {
  it('labels a week from its first day, across months and years', () => {
    expect(weekLabelFromStart('2026-11-16')).toBe('16/11 - 22/11')
    expect(weekLabelFromStart('2026-11-30')).toBe('30/11 - 6/12')
    expect(weekLabelFromStart('2026-12-28')).toBe('28/12 - 3/1')
    expect(weekLabelFromStart('')).toBe('')
  })

  it('finds the Monday of any day, across months and years', () => {
    expect(mondayOf('2026-11-18')).toBe('2026-11-16') // Wednesday
    expect(mondayOf('2026-11-16')).toBe('2026-11-16') // Monday
    expect(mondayOf('2026-11-22')).toBe('2026-11-16') // Sunday
    expect(mondayOf('2027-01-01')).toBe('2026-12-28')
    expect(mondayOf('')).toBe('')
  })

  it("reads a week's first day from its date or its label", () => {
    expect(startDateOf({ startDate: '2026-11-16', weekLabel: 'x' }, today)).toBe('2026-11-16')
    expect(startDateOf({ startDate: null, weekLabel: '9/11 - 15/11' }, today)).toBe('2026-11-09')
    expect(startDateOf({ startDate: null, weekLabel: 'Tuần lễ' }, today)).toBe('')
  })

  it('suggests the week after the latest one', () => {
    expect(nextWeekStart({ startDate: '2026-11-09', weekLabel: 'x' }, today)).toBe('2026-11-16')
    // Older weeks without a stored date: read from the label.
    expect(
      nextWeekStart({ startDate: null, weekLabel: '29/12 - 4/1' }, new Date(2026, 11, 28)),
    ).toBe('2027-01-05')
  })

  it('falls back to next Monday', () => {
    expect(nextWeekStart(undefined, today)).toBe('2026-11-16') // today is Tuesday 10/11
    expect(nextWeekStart({ startDate: null, weekLabel: 'Tuần lễ' }, new Date(2026, 10, 16))).toBe(
      '2026-11-23',
    )
  })
})

describe('datetime-local conversion', () => {
  it('round-trips through local time', () => {
    const iso = new Date(2026, 10, 16, 20, 30).toISOString()
    expect(toLocalInput(iso)).toBe('2026-11-16T20:30')
    expect(fromLocalInput('2026-11-16T20:30')).toBe(iso)
  })

  it('treats empty or invalid values as "no time"', () => {
    expect(toLocalInput(null)).toBe('')
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('nope')).toBeNull()
  })
})
