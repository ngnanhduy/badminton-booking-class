import type { SlotRename } from '@/types/admin'
import { formatHour, parseSlot } from './slots'

/**
 * Editable form of a week's time slots. A week stores two label lists ("Thứ 2 18h - 20h"):
 * `slots1` for session 1 and `slots2` for sessions 2 and 3. The editor shows one list of
 * slots per day instead, each with a toggle for each list.
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
  /** Offered for session 1 / for sessions 2 and 3. */
  session1: boolean
  sessions23: boolean
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
 * Drafts for the slots in `slots1`/`slots2`. `saved` are the labels the week currently has
 * (default: these same lists); only those count as existing slots, so copying another week's
 * slots never "renames" anything.
 */
export function draftsFromSlots(
  slots1: readonly string[],
  slots2: readonly string[],
  saved: ReadonlySet<string> = new Set([...slots1, ...slots2]),
): SlotDraft[] {
  return [...new Set([...slots1, ...slots2])].map((label) => {
    const slot = parseSlot(label)
    const readable = slot.dayIndex <= 6 && slot.start !== null && slot.end !== null
    const values = readable
      ? { day: slot.dayIndex, start: toTime(slot.start!), end: toTime(slot.end!), text: label }
      : { day: null, start: '', end: '', text: label }
    const original = saved.has(label) ? label : null
    return {
      key: nextKey(),
      ...values,
      session1: slots1.includes(label),
      sessions23: slots2.includes(label),
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
    session1: after?.session1 ?? true,
    sessions23: after?.sessions23 ?? true,
    original: null,
    removed: false,
    initial: null,
  }
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
    if (!issues[d.key] && !d.session1 && !d.sessions23) issues[d.key] = 'noSession'
    if (issues[d.key]) continue
    const id = identity(d)
    const renamedOntoRemoved = !!d.original && labelOf(d) !== d.original && removed.has(id)
    if (seen.has(id) || renamedOntoRemoved) issues[d.key] = 'duplicate'
    else seen.set(id, d.key)
  }
  return {
    issues,
    missingSession1: !active.some((d) => d.session1),
    missingSessions23: !active.some((d) => d.sessions23),
    get ok() {
      return !Object.keys(this.issues).length && !this.missingSession1 && !this.missingSessions23
    },
  }
}

/** The week's slot lists (Mon → Sun, by start time; free-text slots last) and the renames. */
export function slotsFromDrafts(drafts: readonly SlotDraft[]): {
  slots1: string[]
  slots2: string[]
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
    slots1: active.filter((a) => a.d.session1).map((a) => a.label),
    slots2: active.filter((a) => a.d.sessions23).map((a) => a.label),
    renames: active
      .filter((a) => a.d.original && a.label !== a.d.original)
      .map((a) => ({ from: a.d.original!, to: a.label })),
  }
}
