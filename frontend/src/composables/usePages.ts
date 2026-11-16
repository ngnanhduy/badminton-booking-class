import { computed } from 'vue'

import { PAGES } from '@/config/pages'
import { useAuthStore } from '@/stores/auth'
import { useScheduleStore } from '@/stores/schedule'
import type { PageId } from '@/types/booking'

/**
 * Which public pages this visitor can use. Turned-off pages are hidden from students; admins
 * still see them, so they can check a page before turning it back on.
 */
export function usePages() {
  const schedule = useScheduleStore()
  const auth = useAuthStore()

  /** Turned on by the admins (assumed on until the schedule has loaded). */
  const isEnabled = (page: PageId) => schedule.config?.pages?.[page] ?? true
  /** Shown to this visitor. */
  const canView = (page: PageId) => isEnabled(page) || auth.isAdmin

  /** Where the logo leads: the first page this visitor can use (the booking page by default). */
  const home = computed(() => PAGES.find((page) => canView(page.id))?.id ?? 'booking')

  return { isEnabled, canView, home }
}
