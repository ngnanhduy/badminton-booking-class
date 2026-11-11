import { describe, expect, it } from 'vitest'

import { formatHour, groupByDay, mergeSlots, parseSlot, periodOf } from '../slots'

describe('parseSlot', () => {
  it('parses a weekday slot', () => {
    expect(parseSlot('Thứ 2 18h - 20h')).toEqual({
      value: 'Thứ 2 18h - 20h',
      day: 'Thứ 2',
      dayShort: 'T2',
      dayIndex: 0,
      time: '18h – 20h',
      start: 18,
      end: 20,
      period: 'evening',
    })
  })

  it('parses Sunday and morning slots', () => {
    const slot = parseSlot('Chủ nhật 10h - 12h')
    expect(slot).toMatchObject({ day: 'Chủ nhật', dayShort: 'CN', dayIndex: 6, period: 'morning' })
  })

  it('supports minutes and different separators', () => {
    expect(parseSlot('Thứ 7 14h30–16h').time).toBe('14h30 – 16h')
    expect(parseSlot('thứ 5 9:15 - 11:00')).toMatchObject({ start: 9.25, end: 11, dayIndex: 3 })
  })

  it('keeps unknown formats intact', () => {
    expect(parseSlot('Lớp đặc biệt')).toMatchObject({
      day: 'Khác',
      dayIndex: 7,
      time: 'Lớp đặc biệt',
      start: null,
      period: null,
    })
  })
})

describe('groupByDay', () => {
  it('orders days Monday → Sunday and slots by start time', () => {
    const groups = groupByDay([
      'Chủ nhật 10h - 12h',
      'Thứ 3 20h - 22h',
      'Thứ 3 14h - 16h',
      'Thứ 2 18h - 20h',
    ])
    expect(groups.map((g) => g.dayShort)).toEqual(['T2', 'T3', 'CN'])
    expect(groups[1]?.slots.map((s) => s.time)).toEqual(['14h – 16h', '20h – 22h'])
  })

  it('ignores blanks and duplicates', () => {
    const groups = groupByDay(['Thứ 2 18h - 20h', '', 'Thứ 2 18h - 20h'])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.slots).toHaveLength(1)
  })
})

describe('helpers', () => {
  it('mergeSlots returns unique slots in chronological order', () => {
    const merged = mergeSlots(['Thứ 4 18h - 20h', 'Thứ 2 18h - 20h'], ['Thứ 2 18h - 20h'])
    expect(merged.map((s) => s.value)).toEqual(['Thứ 2 18h - 20h', 'Thứ 4 18h - 20h'])
  })

  it('formatHour and periodOf', () => {
    expect(formatHour(18)).toBe('18h')
    expect(formatHour(18.5)).toBe('18h30')
    expect(periodOf(10)).toBe('morning')
    expect(periodOf(14)).toBe('afternoon')
    expect(periodOf(20)).toBe('evening')
  })
})
