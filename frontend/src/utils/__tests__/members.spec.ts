import { describe, expect, it } from 'vitest'

import { setLocale } from '@/i18n'
import type { Member } from '@/types/booking'
import { membersFileName, membersSheet } from '../members'

const member = (zaloName: string, over: Partial<Member> = {}): Member => ({
  zaloName,
  weeks: 1,
  sessions: 2,
  week: null,
  lastWeekLabel: '9/11 - 15/11',
  firstBookedAt: '2026-11-01T00:00:00Z',
  lastBookedAt: '2026-11-01T00:00:00Z',
  attended: 0,
  absent: 0,
  ...over,
})

const week = { weekLabel: '16/11 - 22/11', startDate: '2026-11-16' }
const byName = (a: Member, b: Member) => a.zaloName.localeCompare(b.zaloName, 'vi')

describe('membersSheet', () => {
  const members = [
    member('Chi', { week: { count: 1, slots: ['Thứ 4 18h - 20h'] }, attended: 3, absent: 1 }),
    member('An'),
    member('Bình', {
      weeks: 4,
      sessions: 7,
      week: { count: 2, slots: ['Thứ 4 18h - 20h', 'Thứ 2 17h30 - 19h'] },
      attended: 5,
      absent: 0,
      lastWeekLabel: '16/11 - 22/11',
    }),
  ]

  it('has a column per booked day and lists booked students first', () => {
    const sheet = membersSheet(members, week, byName)

    expect(sheet.name).toBe('Tuần 16/11 - 22/11')
    expect(sheet.columns.map((c) => c.header)).toEqual([
      'Tên Zalo',
      'Thứ 2 16/11',
      'Thứ 4 18/11',
      'Số buổi tuần này',
      'Số tuần đã đăng ký',
      'Tổng số buổi đã đăng ký',
      'Có mặt (tổng)',
      'Vắng (tổng)',
      'Chuyên cần',
      'Tuần đăng ký gần nhất',
    ])
    expect(sheet.columns[8]!.format).toBe('percent')
    expect(sheet.rows).toEqual([
      ['Bình', '17h30 – 19h', '18h – 20h', 2, 4, 7, 5, 0, 1, '16/11 - 22/11'],
      ['Chi', '', '18h – 20h', 1, 1, 2, 3, 1, 0.75, '9/11 - 15/11'],
      ['An', '', '', 0, 1, 2, 0, 0, null, '9/11 - 15/11'],
    ])
  })

  it('follows the chosen order and language', () => {
    setLocale('en')
    const sheet = membersSheet(members, week, (a, b) => b.attended - a.attended)
    expect(sheet.name).toBe('Week 16/11 - 22/11')
    expect(sheet.columns[1]!.header).toBe('Monday 16/11')
    expect(sheet.rows.map((r) => r[0])).toEqual(['Bình', 'Chi', 'An'])
    expect(sheet.rows[0]![1]).toBe('17:30 – 19:00')
  })

  it('has no day columns when nobody booked the week', () => {
    const sheet = membersSheet([member('An')], { weekLabel: 'Tuần mới', startDate: null }, byName)
    expect(sheet.columns[1]!.header).toBe('Số buổi tuần này')
    expect(sheet.rows[0]![0]).toBe('An')
  })

  it('has no phone/email column unless the contacts are shown', () => {
    expect(membersSheet(members, week, byName).columns[1]!.header).not.toBe('SĐT/Email')

    const shown = membersSheet(
      [member('Bình'), member('An', { contact: '0912345678' })],
      { weekLabel: 'Tuần mới', startDate: null },
      byName,
    )
    expect(shown.columns.slice(0, 2).map((c) => c.header)).toEqual(['Tên Zalo', 'SĐT/Email'])
    expect(shown.rows.map((r) => r.slice(0, 2))).toEqual([
      ['An', '0912345678'],
      ['Bình', ''],
    ])
  })

  it('names the file after the week', () => {
    expect(membersFileName('16/11 - 22/11')).toBe('hoc-vien-16_11_-_22_11.xlsx')
  })
})
