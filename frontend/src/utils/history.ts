import type { PastSchedule } from '@/types/booking'
import { parseSlot } from './slots'

/** Why a slot from an earlier week can't be booked again this week. */
export type UnavailableReason = 'notOffered' | 'past' | 'full' | 'sameDay'

export interface ScheduleFit {
  /** Slot per session (length === count); '' where the earlier slot can't be booked. */
  slots: string[]
  /** Earlier slots left out, in their original order. */
  unavailable: { slot: string; reason: UnavailableReason }[]
}

/** What this week allows, from the schedule store. */
export interface WeekAvailability {
  /** Slots offered for each session: [session 1, session 2, session 3]. */
  offered: readonly (readonly string[])[]
  /** Weekdays (0 = Monday) already over. */
  pastDays: ReadonlySet<number>
  isFull: (slot: string) => boolean
}

/** Every order of `items`, in lexicographic order: the original order comes first. */
function permutations(items: number[]): number[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((first) =>
    permutations(items.filter((i) => i !== first)).map((rest) => [first, ...rest]),
  )
}

/**
 * Fits an earlier week's schedule into this week. Each slot goes to a session that offers it
 * (sessions can have different slot lists), keeping the original order when possible. Slots
 * no longer offered, on a day already over, full, or on a day another slot already uses are
 * left out; their sessions stay empty for the student to pick by hand.
 */
export function fitSchedule(past: PastSchedule, week: WeekAvailability): ScheduleFit {
  const count = past.count
  const wanted = past.slots.slice(0, count)
  const offered = Array.from({ length: count }, (_, i) => week.offered[i] ?? [])
  const unavailable = new Map<number, UnavailableReason>()

  const days = new Set<number>()
  wanted.forEach((slot, j) => {
    const { dayIndex } = parseSlot(slot)
    let reason: UnavailableReason | undefined
    if (!slot || !offered.some((list) => list.includes(slot))) reason = 'notOffered'
    else if (week.pastDays.has(dayIndex)) reason = 'past'
    else if (week.isFull(slot)) reason = 'full'
    else if (days.has(dayIndex)) reason = 'sameDay'
    if (reason) unavailable.set(j, reason)
    else if (dayIndex < 7) days.add(dayIndex)
  })

  // Try each way of handing the slots to sessions; keep the one that places the most.
  let best: number[] = []
  let placedBest = -1
  for (const perm of permutations([...Array(count).keys()])) {
    const placed = wanted.filter(
      (slot, j) => !unavailable.has(j) && offered[perm[j]!]!.includes(slot),
    ).length
    if (placed > placedBest) {
      best = perm
      placedBest = placed
    }
  }

  const slots: string[] = Array.from({ length: count }, () => '')
  wanted.forEach((slot, j) => {
    if (unavailable.has(j)) return
    const session = best[j]!
    // Offered only for a session another slot needed more.
    if (offered[session]!.includes(slot)) slots[session] = slot
    else unavailable.set(j, 'notOffered')
  })

  return {
    slots,
    unavailable: [...unavailable.entries()]
      .sort(([a], [b]) => a - b)
      .map(([j, reason]) => ({ slot: wanted[j]!, reason })),
  }
}
