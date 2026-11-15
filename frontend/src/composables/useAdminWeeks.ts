import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { adminApi } from '@/services/admin'
import type { WeekSummary } from '@/types/admin'

/** Shared across the admin tabs so the list is fetched once and refreshed together. */
const weeks = ref<WeekSummary[]>([])
const loading = ref(false)
const error = ref<unknown>(null)
let pending: Promise<void> | null = null

/** Every week (newest first), and the week chosen in the URL (`?week=<label>`). */
export function useAdminWeeks() {
  const route = useRoute()
  const router = useRouter()

  function load({ force = false } = {}) {
    if (pending) return pending
    if (weeks.value.length && !force) return Promise.resolve()
    loading.value = true
    pending = adminApi
      .listWeeks()
      .then((data) => {
        weeks.value = data.weeks
        error.value = null
      })
      .catch((e: unknown) => {
        error.value = e
      })
      .finally(() => {
        loading.value = false
        pending = null
      })
    return pending
  }

  /** The week the public pages show. */
  const currentWeek = computed(() => weeks.value.find((w) => w.current))
  const openWeek = computed(() => weeks.value.find((w) => w.open))

  /** Label chosen in the URL, or undefined for the current week. */
  const selectedWeek = computed(() => {
    const week = route.query.week
    return typeof week === 'string' && week ? week : undefined
  })

  /** The selected week's summary (the current week when none is chosen). */
  const selected = computed(() =>
    selectedWeek.value
      ? weeks.value.find((w) => w.weekLabel === selectedWeek.value)
      : currentWeek.value,
  )

  /** Opens an admin tab on a week (undefined = current week). */
  function goTo(tab: string | undefined, week?: string) {
    router.replace({
      query: {
        ...route.query,
        tab: tab || undefined,
        week: week && week !== currentWeek.value?.weekLabel ? week : undefined,
      },
    })
  }

  function selectWeek(week: string | undefined) {
    goTo(typeof route.query.tab === 'string' ? route.query.tab : undefined, week)
  }

  /** Replaces one week in the list after it was saved. */
  function replaceWeek(updated: Partial<WeekSummary> & { id: string }) {
    weeks.value = weeks.value.map((w) => (w.id === updated.id ? { ...w, ...updated } : w))
  }

  return {
    weeks,
    loading,
    error,
    load,
    currentWeek,
    openWeek,
    selectedWeek,
    selected,
    selectWeek,
    goTo,
    replaceWeek,
  }
}
