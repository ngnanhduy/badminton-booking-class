import { CalendarClock, CalendarDays, PenLine, UserCheck, UsersRound } from '@lucide/vue'

import type { PageId } from '@/types/booking'

/**
 * Public pages, in menu order. Each one can be turned off by an admin (the server refuses its
 * endpoints too). `id` is the route name.
 */
export const PAGES = [
  { id: 'booking', labelKey: 'nav.booking', icon: PenLine },
  { id: 'edit', labelKey: 'nav.edit', icon: CalendarClock },
  { id: 'checkin', labelKey: 'nav.checkIn', icon: UserCheck },
  { id: 'schedule', labelKey: 'nav.schedule', icon: CalendarDays },
  { id: 'members', labelKey: 'nav.members', icon: UsersRound },
] as const satisfies readonly { id: PageId; labelKey: string; icon: unknown }[]

export const isPageId = (name: unknown): name is PageId => PAGES.some((page) => page.id === name)
