import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useIntervalFn, useNow } from '@vueuse/core'

import { t } from '@/i18n'
import { api, errorMessage } from '@/services/api'
import type { RegistrationStatus, ScheduleConfig } from '@/types/booking'
import { groupByDay, mergeSlots, sessionSlots } from '@/utils/slots'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export type Occupancy = 'empty' | 'available' | 'filling' | 'full'

/** The current week's schedule: settings, slot lists and booking counts. */
export const useScheduleStore = defineStore('schedule', () => {
  const config = ref<ScheduleConfig | null>(null)
  const status = ref<LoadStatus>('idle')
  const error = ref('')
  const lastUpdated = ref<Date | null>(null)

  /** Ticks so the page opens/closes registration on time without a reload. */
  const now = useNow({ scheduler: (cb) => useIntervalFn(cb, 15_000) })

  const isLoading = computed(() => status.value === 'loading')

  /**
   * Whether bookings are accepted right now. Starts from the server's answer and follows the
   * clock across the opening/closing time (the server still checks every submission).
   */
  const registration = computed<RegistrationStatus>(() => {
    const c = config.value
    if (!c) return 'closed'
    if (!c.open) return 'closed'
    const time = now.value.getTime()
    if (c.closesAt && time >= Date.parse(c.closesAt)) return 'closed'
    if (c.opensAt && time < Date.parse(c.opensAt)) return 'upcoming'
    return 'open'
  })
  const isOpen = computed(() => registration.value === 'open')
  const capacity = computed(() => config.value?.capacity ?? null)
  /** Slots offered for each session, grouped by day: [session 1, session 2, session 3]. */
  const sessionDays = computed(() => sessionSlots(config.value).map((list) => groupByDay(list)))
  const allSlots = computed(() => mergeSlots(...sessionSlots(config.value)))
  const totalSeatsTaken = computed(() =>
    Object.values(config.value?.counts ?? {}).reduce((sum, n) => sum + n, 0),
  )

  function daysForSession(index: number) {
    return sessionDays.value[index] ?? []
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
    registration,
    isOpen,
    capacity,
    sessionDays,
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
