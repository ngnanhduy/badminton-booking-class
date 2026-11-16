import { describe, expect, it } from 'vitest'

import {
  addSlotToDays,
  draftsFromSlots,
  labelOf,
  MAKEUP,
  newDraft,
  slotsFromDrafts,
  templateIssue,
  validateDrafts,
  type SessionFlags,
} from '../slotEditor'

const S1 = ['Thứ 2 18h - 20h', 'Thứ 4 18h - 20h', 'CN 9h - 11h']
const S2 = ['Thứ 2 18h - 20h', 'Thứ 3 14h - 16h', 'Buổi bù đặc biệt']
/** Session 3 differs from session 2: no "Thứ 3 14h", plus "Thứ 5 14h". */
const S3 = ['Thứ 2 18h - 20h', 'Thứ 5 14h - 16h', 'Buổi bù đặc biệt']
const WEEK = { slots1: S1, slots2: S2, slots3: S3 }
const lists = (slots1: string[], slots2: string[], slots3 = slots2) => ({ slots1, slots2, slots3 })

describe('slot editor', () => {
  it('turns the three session lists into one list with a toggle per session', () => {
    const drafts = draftsFromSlots(WEEK)
    expect(drafts.map((d) => [d.day, d.start, d.end, d.sessions])).toEqual([
      [0, '18:00', '20:00', [true, true, true, false]],
      [2, '18:00', '20:00', [true, false, false, false]],
      [6, '09:00', '11:00', [true, false, false, false]],
      [1, '14:00', '16:00', [false, true, false, false]],
      [null, '', '', [false, true, true, false]],
      [3, '14:00', '16:00', [false, false, true, false]],
    ])
  })

  it('reads and saves the make-up class list as a fourth toggle', () => {
    const drafts = draftsFromSlots({ ...WEEK, slotsMakeup: ['Thứ 4 18h - 20h', 'Thứ 6 20h - 22h'] })
    // A slot offered only for make-up classes is a slot of the week too.
    expect(drafts.map((d) => [labelOf(d), d.sessions])).toEqual([
      ['Thứ 2 18h - 20h', [true, true, true, false]],
      ['Thứ 4 18h - 20h', [true, false, false, true]],
      ['CN 9h - 11h', [true, false, false, false]],
      ['Thứ 3 14h - 16h', [false, true, false, false]],
      ['Buổi bù đặc biệt', [false, true, true, false]],
      ['Thứ 5 14h - 16h', [false, false, true, false]],
      ['Thứ 6 20h - 22h', [false, false, false, true]],
    ])
    drafts[0]!.sessions[MAKEUP] = true
    const { slots1, slotsMakeup, renames } = slotsFromDrafts(drafts)
    expect(slotsMakeup).toEqual(['Thứ 2 18h - 20h', 'Thứ 4 18h - 20h', 'Thứ 6 20h - 22h'])
    expect(slots1).toEqual(S1)
    expect(renames).toEqual([])
  })

  it('make-up classes are optional, and a slot can be for make-up classes only', () => {
    const drafts = draftsFromSlots(lists(['Thứ 2 18h - 20h'], ['Thứ 3 18h - 20h']))
    expect(validateDrafts(drafts).ok).toBe(true)
    expect(slotsFromDrafts(drafts).slotsMakeup).toEqual([])
    drafts.push({ ...newDraft(4), sessions: [false, false, false, true] })
    expect(validateDrafts(drafts).ok).toBe(true)
    expect(slotsFromDrafts(drafts)).toMatchObject({
      slots1: ['Thứ 2 18h - 20h'],
      slotsMakeup: ['Thứ 6 18h - 20h'],
    })
    // New slots are offered for every session and for make-up classes.
    expect(newDraft(2).sessions).toEqual([true, true, true, true])
  })

  it('saves untouched slots with their exact labels, sorted by day and time', () => {
    const { slots1, slots2, slots3, renames } = slotsFromDrafts(draftsFromSlots(WEEK))
    expect(slots1).toEqual(['Thứ 2 18h - 20h', 'Thứ 4 18h - 20h', 'CN 9h - 11h'])
    expect(slots2).toEqual(['Thứ 2 18h - 20h', 'Thứ 3 14h - 16h', 'Buổi bù đặc biệt'])
    expect(slots3).toEqual(['Thứ 2 18h - 20h', 'Thứ 5 14h - 16h', 'Buổi bù đặc biệt'])
    expect(renames).toEqual([])
  })

  it('turns a slot on for session 3 only', () => {
    const drafts = draftsFromSlots(WEEK)
    drafts[3]!.sessions = [false, false, true, false] // Thứ 3 14h: from session 2 to session 3
    const { slots2, slots3 } = slotsFromDrafts(drafts)
    expect(slots2).toEqual(['Thứ 2 18h - 20h', 'Buổi bù đặc biệt'])
    expect(slots3).toEqual([
      'Thứ 2 18h - 20h',
      'Thứ 3 14h - 16h',
      'Thứ 5 14h - 16h',
      'Buổi bù đặc biệt',
    ])
  })

  it('reports edited times as renames so bookings can follow', () => {
    const drafts = draftsFromSlots(WEEK)
    drafts[0]!.start = '18:30'
    drafts[0]!.end = '20:30'
    drafts[2]!.day = 5 // CN → Thứ 7
    const { slots1, slots3, renames } = slotsFromDrafts(drafts)
    expect(slots1).toEqual(['Thứ 2 18h30 - 20h30', 'Thứ 4 18h - 20h', 'Thứ 7 9h - 11h'])
    expect(slots3[0]).toBe('Thứ 2 18h30 - 20h30')
    expect(renames).toEqual([
      { from: 'Thứ 2 18h - 20h', to: 'Thứ 2 18h30 - 20h30' },
      { from: 'CN 9h - 11h', to: 'Thứ 7 9h - 11h' },
    ])
  })

  it('adds slots after the last one of the day and drops removed ones', () => {
    const drafts = draftsFromSlots(WEEK)
    const added = newDraft(0, drafts[0])
    expect([added.start, added.end, labelOf(added)]).toEqual(['20:00', '22:00', 'Thứ 2 20h - 22h'])
    expect(added.sessions).toEqual([true, true, true, false])
    drafts.push(added)
    drafts[1]!.removed = true
    const { slots1, renames } = slotsFromDrafts(drafts)
    expect(slots1).toEqual(['Thứ 2 18h - 20h', 'Thứ 2 20h - 22h', 'CN 9h - 11h'])
    expect(renames).toEqual([])
  })

  it('copied slots are never renames, even when the label already exists', () => {
    const saved = new Set(['Thứ 2 18h - 20h', 'Thứ 6 18h - 20h'])
    const drafts = draftsFromSlots(
      lists(['Thứ 2 18h - 20h', 'Thứ 5 18h - 20h'], ['Thứ 2 18h - 20h']),
      saved,
    )
    expect(drafts.map((d) => d.original)).toEqual(['Thứ 2 18h - 20h', null])
    expect(slotsFromDrafts(drafts).renames).toEqual([])
  })

  it('validates times, sessions and duplicates', () => {
    const drafts = draftsFromSlots(WEEK)
    drafts[0]!.end = '17:00'
    drafts[1]!.sessions = [false, false, false, false]
    drafts.push({ ...newDraft(6), start: '09:00', end: '11:00' }) // same as "CN 9h - 11h"
    const result = validateDrafts(drafts)
    expect(Object.values(result.issues)).toEqual(['endBeforeStart', 'noSession', 'duplicate'])
    expect(result.ok).toBe(false)
  })

  it('needs at least one slot for each session', () => {
    const drafts = draftsFromSlots(lists(['Thứ 2 18h - 20h'], ['Thứ 3 18h - 20h']))
    expect(validateDrafts(drafts).missingSessions).toEqual([])
    drafts[1]!.sessions = [false, true, false, false] // Thứ 3 no longer offered for session 3
    expect(validateDrafts(drafts)).toMatchObject({ missingSessions: [3], ok: false })
    drafts[1]!.removed = true
    expect(validateDrafts(drafts).missingSessions).toEqual([2, 3])
  })

  it('adds one time to several days at once', () => {
    const drafts = draftsFromSlots(WEEK)
    const result = addSlotToDays(drafts, {
      days: [4, 0, 1],
      start: '20:00',
      end: '22:00',
      sessions: [true, false, false, false],
    })
    expect(result).toEqual({ added: 3, existing: 0 })
    const { slots1, slots2 } = slotsFromDrafts(drafts)
    expect(slots1).toEqual([
      'Thứ 2 18h - 20h',
      'Thứ 2 20h - 22h',
      'Thứ 3 20h - 22h',
      'Thứ 4 18h - 20h',
      'Thứ 6 20h - 22h',
      'CN 9h - 11h',
    ])
    expect(slots2).toEqual(S2)
    expect(validateDrafts(drafts).ok).toBe(true)
  })

  it('keeps slots a day already has and restores removed ones', () => {
    const drafts = draftsFromSlots(WEEK)
    drafts[0]!.sessions = [true, false, false, false] // Thứ 2 18h - 20h: session 1 only
    drafts[1]!.removed = true // Thứ 4 18h - 20h
    const result = addSlotToDays(drafts, {
      days: [0, 2],
      start: '18:00',
      end: '20:00',
      sessions: [false, false, true, false],
    })
    expect(result).toEqual({ added: 1, existing: 1 })
    expect(drafts).toHaveLength(6)
    // Thứ 2 keeps session 1 and gets session 3; Thứ 4 comes back with session 3 only.
    expect(drafts[0]!.sessions).toEqual([true, false, true, false])
    expect([drafts[1]!.removed, drafts[1]!.sessions]).toEqual([false, [false, false, true, false]])
    expect(slotsFromDrafts(drafts).renames).toEqual([])
  })

  it('checks the time and sessions before adding to several days', () => {
    const base = {
      days: [0],
      start: '18:00',
      end: '20:00',
      sessions: [true, true, true, true] as SessionFlags,
    }
    expect(templateIssue(base)).toBeNull()
    expect(templateIssue({ ...base, end: '' })).toBe('timeRequired')
    expect(templateIssue({ ...base, end: '17:00' })).toBe('endBeforeStart')
    expect(templateIssue({ ...base, sessions: [false, false, false, false] })).toBe('noSession')
    const drafts = draftsFromSlots(WEEK)
    expect(addSlotToDays(drafts, { ...base, end: '17:00' })).toEqual({ added: 0, existing: 0 })
    expect(drafts).toHaveLength(6)
  })

  it('refuses moving a slot onto one being removed', () => {
    const drafts = draftsFromSlots(
      lists(['Thứ 2 18h - 20h', 'Thứ 2 20h - 22h'], ['Thứ 2 18h - 20h']),
    )
    drafts[1]!.removed = true
    drafts[0]!.start = '20:00'
    drafts[0]!.end = '22:00'
    expect(validateDrafts(drafts).issues).toEqual({ [drafts[0]!.key]: 'duplicate' })
  })
})
