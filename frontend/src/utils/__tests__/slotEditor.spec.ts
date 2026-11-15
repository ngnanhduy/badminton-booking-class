import { describe, expect, it } from 'vitest'

import { draftsFromSlots, labelOf, newDraft, slotsFromDrafts, validateDrafts } from '../slotEditor'

const S1 = ['Thứ 2 18h - 20h', 'Thứ 4 18h - 20h', 'CN 9h - 11h']
const S2 = ['Thứ 2 18h - 20h', 'Thứ 3 14h - 16h', 'Buổi bù đặc biệt']

describe('slot editor', () => {
  it('turns both slot lists into one list with session toggles', () => {
    const drafts = draftsFromSlots(S1, S2)
    expect(drafts.map((d) => [d.day, d.start, d.end, d.session1, d.sessions23])).toEqual([
      [0, '18:00', '20:00', true, true],
      [2, '18:00', '20:00', true, false],
      [6, '09:00', '11:00', true, false],
      [1, '14:00', '16:00', false, true],
      [null, '', '', false, true],
    ])
  })

  it('saves untouched slots with their exact labels, sorted by day and time', () => {
    const { slots1, slots2, renames } = slotsFromDrafts(draftsFromSlots(S1, S2))
    expect(slots1).toEqual(['Thứ 2 18h - 20h', 'Thứ 4 18h - 20h', 'CN 9h - 11h'])
    expect(slots2).toEqual(['Thứ 2 18h - 20h', 'Thứ 3 14h - 16h', 'Buổi bù đặc biệt'])
    expect(renames).toEqual([])
  })

  it('reports edited times as renames so bookings can follow', () => {
    const drafts = draftsFromSlots(S1, S2)
    drafts[0]!.start = '18:30'
    drafts[0]!.end = '20:30'
    drafts[2]!.day = 5 // CN → Thứ 7
    const { slots1, renames } = slotsFromDrafts(drafts)
    expect(slots1).toEqual(['Thứ 2 18h30 - 20h30', 'Thứ 4 18h - 20h', 'Thứ 7 9h - 11h'])
    expect(renames).toEqual([
      { from: 'Thứ 2 18h - 20h', to: 'Thứ 2 18h30 - 20h30' },
      { from: 'CN 9h - 11h', to: 'Thứ 7 9h - 11h' },
    ])
  })

  it('adds slots after the last one of the day and drops removed ones', () => {
    const drafts = draftsFromSlots(S1, S2)
    const added = newDraft(0, drafts[0])
    expect([added.start, added.end, labelOf(added)]).toEqual(['20:00', '22:00', 'Thứ 2 20h - 22h'])
    drafts.push(added)
    drafts[1]!.removed = true
    const { slots1, renames } = slotsFromDrafts(drafts)
    expect(slots1).toEqual(['Thứ 2 18h - 20h', 'Thứ 2 20h - 22h', 'CN 9h - 11h'])
    expect(renames).toEqual([])
  })

  it('copied slots are never renames, even when the label already exists', () => {
    const saved = new Set(['Thứ 2 18h - 20h', 'Thứ 6 18h - 20h'])
    const drafts = draftsFromSlots(
      ['Thứ 2 18h - 20h', 'Thứ 5 18h - 20h'],
      ['Thứ 2 18h - 20h'],
      saved,
    )
    expect(drafts.map((d) => d.original)).toEqual(['Thứ 2 18h - 20h', null])
    expect(slotsFromDrafts(drafts).renames).toEqual([])
  })

  it('validates times, sessions and duplicates', () => {
    const drafts = draftsFromSlots(S1, S2)
    drafts[0]!.end = '17:00'
    drafts[1]!.session1 = false
    drafts.push({ ...newDraft(6), start: '09:00', end: '11:00' }) // same as "CN 9h - 11h"
    const result = validateDrafts(drafts)
    expect(Object.values(result.issues)).toEqual(['endBeforeStart', 'noSession', 'duplicate'])
    expect(result.ok).toBe(false)
  })

  it('needs at least one slot for each session list', () => {
    const drafts = draftsFromSlots(['Thứ 2 18h - 20h'], ['Thứ 3 18h - 20h'])
    drafts[1]!.removed = true
    expect(validateDrafts(drafts)).toMatchObject({
      missingSession1: false,
      missingSessions23: true,
    })
  })

  it('refuses moving a slot onto one being removed', () => {
    const drafts = draftsFromSlots(['Thứ 2 18h - 20h', 'Thứ 2 20h - 22h'], ['Thứ 2 18h - 20h'])
    drafts[1]!.removed = true
    drafts[0]!.start = '20:00'
    drafts[0]!.end = '22:00'
    expect(validateDrafts(drafts).issues).toEqual({ [drafts[0]!.key]: 'duplicate' })
  })
})
