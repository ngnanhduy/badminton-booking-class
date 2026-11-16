import type { SlotRename } from '@/types/admin'
import { formatHour, parseSlot } from './slots'

/**
 * Whether a slot is offered for session 1, 2 and 3 of a booking (`[i]` = session i + 1) and
 * for a make-up class (`[MAKEUP]`).
 */
export type SessionFlags = [boolean, boolean, boolean, boolean]

/** Index of the make-up class in SessionFlags. */
export const MAKEUP = 3

/** A week's slot lists, one per session, plus the make-up class list. */
export interface SlotLists {
  slots1: readonly string[]
  slots2: readonly string[]
  slots3: readonly string[]
  /** Left out by older data: no make-up classes. */
  slotsMakeup?: readonly string[]
}

const listsOf = (w: SlotLists) => [w.slots1, w.slots2, w.slots3, w.slotsMakeup ?? []] as const
const noneOn = (s: readonly boolean[]) => !s.some(Boolean)

/** Every label a week has, in any list. */
export const allLabels = (w: SlotLists) => new Set(listsOf(w).flat())

/**
 * Editable form of a week's time slots. A week stores one label list ("Thứ 2 18h - 20h") per
 * session of a booking: `slots1`, `slots2` and `slots3`, plus `slotsMakeup` for make-up
 * classes. The editor shows one list of slots per day instead, each with a toggle per session
 * and one for make-up classes.
 */
export interface SlotDraft {
  /** Stable key for v-for. */
  key: string
  /** 0 = Monday … 6 = Sunday; null for a free-text slot the app can't read. */
  day: number | null
  /** "HH:mm" (empty for free-text slots). */
  start: string
  end: string
  /** The label itself, for free-text slots. */
  text: string
  /** Offered for session 1, 2, 3 and for a make-up class. */
  sessions: SessionFlags
  /** Label as saved in this week, or null for a slot added (or copied) in the editor. */
  original: string | null
  /** Saved slot marked for removal (kept until saved, so it can be undone). */
  removed: boolean
  /** Values when loaded, to keep the original label when nothing changed. */
  initial: { day: number | null; start: string; end: string; text: string } | null
}

/** Weekday prefixes as stored in labels (labels stay in Vietnamese; see parseSlot). */
const DAY_PREFIX = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']

const pad = (n: number) => String(n).padStart(2, '0')
/** 18.5 → "18:30" */
const toTime = (hour: number) => `${pad(Math.floor(hour))}:${pad(Math.round((hour % 1) * 60))}`
/** "18:30" → 18.5, or NaN. */
const toHour = (time: string) => {
  const match = time.match(/^(\d{1,2}):(\d{2})$/)
  return match ? Number(match[1]) + Number(match[2]) / 60 : Number.NaN
}

let seq = 0
const nextKey = () => `slot-${++seq}`

/**
 * Drafts for a week's slots. `saved` are the labels the week currently has (default: these
 * same lists); only those count as existing slots, so copying another week's slots never
 * "renames" anything.
 */
export function draftsFromSlots(
  week: SlotLists,
  saved: ReadonlySet<string> = allLabels(week),
): SlotDraft[] {
  const lists = listsOf(week)
  return [...new Set(lists.flat())].map((label) => {
    const slot = parseSlot(label)
    const readable = slot.dayIndex <= 6 && slot.start !== null && slot.end !== null
    const values = readable
      ? { day: slot.dayIndex, start: toTime(slot.start!), end: toTime(slot.end!), text: label }
      : { day: null, start: '', end: '', text: label }
    const original = saved.has(label) ? label : null
    return {
      key: nextKey(),
      ...values,
      sessions: lists.map((list) => list.includes(label)) as SessionFlags,
      original,
      removed: false,
      initial: original ? { ...values } : null,
    }
  })
}

/** A new slot on `day`, starting when the day's last slot ends (or at 18:00), 2 hours long. */
export function newDraft(day: number, after?: SlotDraft): SlotDraft {
  let start = after ? toHour(after.end) : 18
  if (Number.isNaN(start) || start > 22) start = 18
  return {
    key: nextKey(),
    day,
    start: toTime(start),
    end: toTime(start + 2),
    text: '',
    sessions: after ? [...after.sessions] : [true, true, true, true],
    original: null,
    removed: false,
    initial: null,
  }
}

/** One time range to add on several days at once. */
export interface SlotTemplate {
  /** 0 = Monday … 6 = Sunday. */
  days: readonly number[]
  /** "HH:mm" */
  start: string
  end: string
  sessions: SessionFlags
}

/** What stops a template from being added (no days chosen yet is not an issue). */
export function templateIssue(t: SlotTemplate): SlotIssue | null {
  const start = toHour(t.start)
  const end = toHour(t.end)
  if (Number.isNaN(start) || Number.isNaN(end)) return 'timeRequired'
  if (end <= start) return 'endBeforeStart'
  if (noneOn(t.sessions)) return 'noSession'
  return null
}

/**
 * Adds the template's time on each of its days. A day that already has a slot at that time
 * keeps it and only gets the chosen sessions turned on; a slot marked for removal is
 * restored instead of added twice. Returns how many slots were added and how many existed.
 */
export function addSlotToDays(
  drafts: SlotDraft[],
  t: SlotTemplate,
): { added: number; existing: number } {
  if (templateIssue(t)) return { added: 0, existing: 0 }
  const start = toHour(t.start)
  const end = toHour(t.end)
  let added = 0
  let existing = 0
  for (const day of [...new Set(t.days)].sort((a, b) => a - b)) {
    const same = drafts.filter(
      (d) => d.day === day && toHour(d.start) === start && toHour(d.end) === end,
    )
    const active = same.find((d) => !d.removed)
    if (active) {
      active.sessions = active.sessions.map((on, i) => on || t.sessions[i]!) as SessionFlags
      existing++
      continue
    }
    const removed = same[0]
    if (removed) {
      removed.removed = false
      removed.sessions = [...t.sessions]
    } else {
      drafts.push({
        key: nextKey(),
        day,
        start: toTime(start),
        end: toTime(end),
        text: '',
        sessions: [...t.sessions],
        original: null,
        removed: false,
        initial: null,
      })
    }
    added++
  }
  return { added, existing }
}

/** A saved slot whose day and time weren't touched. */
function unchanged(d: SlotDraft) {
  const i = d.initial
  return (
    !!d.original &&
    !!i &&
    i.day === d.day &&
    i.start === d.start &&
    i.end === d.end &&
    i.text === d.text
  )
}

/** The label a draft is saved as. Untouched slots keep their exact original label. */
export function labelOf(d: SlotDraft): string {
  if (unchanged(d)) return d.original!
  if (d.day === null) return d.text.trim()
  return `${DAY_PREFIX[d.day]} ${formatHour(toHour(d.start))} - ${formatHour(toHour(d.end))}`
}

export type SlotIssue =
  'timeRequired' | 'endBeforeStart' | 'noSession' | 'duplicate' | 'textRequired'

/** Problems per draft key, plus whether each session still has at least one slot. */
export function validateDrafts(drafts: readonly SlotDraft[]) {
  const active = drafts.filter((d) => !d.removed)
  /** Same day and time = same class, however the label is written ("CN" vs "Chủ nhật"). */
  const identity = (d: SlotDraft) =>
    d.day === null ? `text:${labelOf(d)}` : `${d.day}|${toHour(d.start)}|${toHour(d.end)}`
  // An edited slot can't take a removed slot's place (its bookings would be merged).
  const removed = new Set(drafts.filter((d) => d.removed && d.original).map(identity))
  const issues: Record<string, SlotIssue> = {}
  const seen = new Map<string, string>()
  for (const d of active) {
    if (unchanged(d)) {
      // Saved as-is: never flag a slot the admin didn't touch.
    } else if (d.day === null) {
      if (!d.text.trim()) issues[d.key] = 'textRequired'
    } else if (Number.isNaN(toHour(d.start)) || Number.isNaN(toHour(d.end))) {
      issues[d.key] = 'timeRequired'
    } else if (toHour(d.end) <= toHour(d.start)) {
      issues[d.key] = 'endBeforeStart'
    }
    if (!issues[d.key] && noneOn(d.sessions)) issues[d.key] = 'noSession'
    if (issues[d.key]) continue
    const id = identity(d)
    const renamedOntoRemoved = !!d.original && labelOf(d) !== d.original && removed.has(id)
    if (seen.has(id) || renamedOntoRemoved) issues[d.key] = 'duplicate'
    else seen.set(id, d.key)
  }
  return {
    issues,
    /** Sessions (1-based) that no slot is offered for. Make-up classes are optional. */
    missingSessions: [1, 2, 3].filter((n) => !active.some((d) => d.sessions[n - 1])),
    get ok() {
      return !Object.keys(this.issues).length && !this.missingSessions.length
    },
  }
}

/** The week's slot lists (Mon → Sun, by start time; free-text slots last) and the renames. */
export function slotsFromDrafts(drafts: readonly SlotDraft[]): {
  slots1: string[]
  slots2: string[]
  slots3: string[]
  slotsMakeup: string[]
  renames: SlotRename[]
} {
  const active = drafts
    .filter((d) => !d.removed)
    .map((d, index) => ({ d, index, label: labelOf(d) }))
    .sort((a, b) => {
      const dayA = a.d.day ?? 7
      const dayB = b.d.day ?? 7
      if (dayA !== dayB) return dayA - dayB
      if (dayA === 7) return a.index - b.index
      return toHour(a.d.start) - toHour(b.d.start)
    })
  return {
    slots1: active.filter((a) => a.d.sessions[0]).map((a) => a.label),
    slots2: active.filter((a) => a.d.sessions[1]).map((a) => a.label),
    slots3: active.filter((a) => a.d.sessions[2]).map((a) => a.label),
    slotsMakeup: active.filter((a) => a.d.sessions[MAKEUP]).map((a) => a.label),
    renames: active
      .filter((a) => a.d.original && a.label !== a.d.original)
      .map((a) => ({ from: a.d.original!, to: a.label })),
  }
}
