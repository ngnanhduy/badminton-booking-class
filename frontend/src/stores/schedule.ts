import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { t } from '@/i18n'
import { api, errorMessage } from '@/services/api'
import type { ScheduleConfig } from '@/types/booking'
import { groupByDay, mergeSlots } from '@/utils/slots'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export type Occupancy = 'empty' | 'available' | 'filling' | 'full'

/** The current week's schedule: settings, slot lists and booking counts. */
export const useScheduleStore = defineStore('schedule', () => {
  const config = ref<ScheduleConfig | null>(null)
  const status = ref<LoadStatus>('idle')
  const error = ref('')
  const lastUpdated = ref<Date | null>(null)

  const isLoading = computed(() => status.value === 'loading')
  const capacity = computed(() => config.value?.capacity ?? null)
  const session1Days = computed(() => groupByDay(config.value?.slots1 ?? []))
  const session2Days = computed(() => groupByDay(config.value?.slots2 ?? []))
  const allSlots = computed(() =>
    mergeSlots(config.value?.slots1 ?? [], config.value?.slots2 ?? []),
  )
  const totalSeatsTaken = computed(() =>
    Object.values(config.value?.counts ?? {}).reduce((sum, n) => sum + n, 0),
  )

  function daysForSession(index: number) {
    return index === 0 ? session1Days.value : session2Days.value
  }

  function countOf(slot: string): number {
    return config.value?.counts[slot] ?? 0
  }

  function isFull(slot: string): boolean {
    return capacity.value !== null && countOf(slot) >= capacity.value
  }

  function occupancyOf(slot: string): Occupancy {
    const count = countOf(slot)
    if (capacity.value === null) return count ? 'available' : 'empty'
    if (count >= capacity.value) return 'full'
    if (count / capacity.value >= 0.75) return 'filling'
    return count ? 'available' : 'empty'
  }

  function setConfig(next: ScheduleConfig) {
    config.value = next
    status.value = 'ready'
    error.value = ''
    lastUpdated.value = new Date()
  }

  /** Loads the schedule once; pass `force` to refresh. Concurrent calls are ignored. */
  async function load({ force = false } = {}) {
    if (status.value === 'loading') return
    if (config.value && !force) return

    status.value = 'loading'
    error.value = ''
    try {
      setConfig(await api.getSchedule())
    } catch (e) {
      error.value = errorMessage(e, t('common.scheduleLoadFailed'))
      status.value = config.value ? 'ready' : 'error'
    }
  }

  return {
    config,
    status,
    error,
    lastUpdated,
    isLoading,
    capacity,
    session1Days,
    session2Days,
    allSlots,
    totalSeatsTaken,
    daysForSession,
    countOf,
    isFull,
    occupancyOf,
    setConfig,
    load,
  }
})
