<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowRight, Flame, Gauge, RefreshCw, Ticket, Users, WifiOff } from '@lucide/vue'

import ScheduleMatrix from '@/components/schedule/ScheduleMatrix.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { formatTime, slotShort } from '@/i18n/format'
import { useScheduleStore } from '@/stores/schedule'
import type { Slot } from '@/types/booking'

const { t } = useI18n()
const schedule = useScheduleStore()

// Show cached data instantly, but always refresh counts when opening this page.
onMounted(() => schedule.load({ force: true }))

const secondaryOnly = computed(() => {
  const config = schedule.config
  if (!config) return new Set<string>()
  const session1 = new Set(config.slots1)
  return new Set(config.slots2.filter((s) => !session1.has(s)))
})

const busiest = computed(() => {
  let best: { slot: Slot; count: number } | null = null
  for (const slot of schedule.allSlots) {
    const count = schedule.countOf(slot.value)
    if (count > 0 && (!best || count > best.count)) best = { slot, count }
  }
  return best
})

const stats = computed(() => {
  const config = schedule.config
  if (!config) return []
  const top = busiest.value
  return [
    {
      label: t('schedule.statStudents'),
      value: String(config.totalBookings),
      hint: t('schedule.statStudentsHint'),
      icon: Users,
    },
    {
      label: t('schedule.statSeats'),
      value: String(schedule.totalSeatsTaken),
      hint: t('schedule.statSeatsHint'),
      icon: Ticket,
    },
    {
      label: t('schedule.statBusiest'),
      value: top ? slotShort(top.slot) : '—',
      hint: top
        ? t('schedule.statBusiestHint', { n: top.count }, top.count)
        : t('schedule.statBusiestNone'),
      icon: Flame,
    },
    {
      label: t('schedule.statCapacity'),
      value: config.capacity
        ? t('schedule.statCapacityValue', { n: config.capacity }, config.capacity)
        : t('schedule.unlimited'),
      hint: config.capacity ? t('schedule.capacityHint') : t('schedule.capacityNone'),
      icon: Gauge,
    },
  ]
})

const updatedAt = computed(() => (schedule.lastUpdated ? formatTime(schedule.lastUpdated) : ''))
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
    <header
      class="flex animate-fade-in-up flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <span
          v-if="schedule.config"
          class="inline-flex items-center rounded-full bg-brand-600/10 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-600/15 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20"
        >
          {{ t('common.week', { week: schedule.config.weekLabel }) }}
        </span>
        <h1
          class="mt-4 text-4xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl dark:text-white"
        >
          {{ t('titles.schedule') }}
        </h1>
        <p class="mt-3 max-w-xl leading-relaxed text-zinc-600 dark:text-zinc-400">
          {{ t('schedule.intro') }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <BaseButton
          variant="secondary"
          :icon="RefreshCw"
          :loading="schedule.isLoading"
          @click="schedule.load({ force: true })"
        >
          {{ t('common.refresh') }}
        </BaseButton>
        <BaseButton :to="{ name: 'booking' }" :icon-right="ArrowRight">
          {{ t('schedule.book') }}
        </BaseButton>
      </div>
    </header>

    <BaseCard v-if="schedule.status === 'error'" class="mt-10">
      <EmptyState
        :icon="WifiOff"
        tone="danger"
        :title="t('common.scheduleLoadFailed')"
        :description="schedule.error"
      >
        <BaseButton :icon="RefreshCw" @click="schedule.load({ force: true })">
          {{ t('common.retry') }}
        </BaseButton>
      </EmptyState>
    </BaseCard>

    <div v-else-if="!schedule.config" class="mt-10 space-y-6" aria-busy="true">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div
          v-for="n in 4"
          :key="n"
          class="h-28 animate-pulse rounded-2xl bg-white/70 ring-1 ring-zinc-950/5 dark:bg-zinc-900/50 dark:ring-white/10"
        />
      </div>
      <div
        class="h-96 animate-pulse rounded-2xl bg-white/70 ring-1 ring-zinc-950/5 dark:bg-zinc-900/50 dark:ring-white/10"
      />
    </div>

    <template v-else>
      <dl class="mt-10 grid animate-fade-in-up grid-cols-2 gap-3 lg:grid-cols-4">
        <BaseCard
          v-for="stat in stats"
          :key="stat.label"
          as="div"
          :padded="false"
          class="p-4 sm:p-5"
        >
          <dt class="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <component
              :is="stat.icon"
              class="size-4 text-brand-600 dark:text-brand-400"
              aria-hidden="true"
            />
            {{ stat.label }}
          </dt>
          <dd class="mt-2">
            <span class="block truncate text-lg font-bold tracking-tight tabular-nums sm:text-xl">
              {{ stat.value }}
            </span>
            <span class="text-xs text-zinc-500 dark:text-zinc-400">{{ stat.hint }}</span>
          </dd>
        </BaseCard>
      </dl>

      <BaseCard
        class="mt-6 animate-fade-in-up"
        :padded="false"
        solid
        aria-labelledby="matrix-title"
      >
        <div
          class="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-950/5 px-5 py-4 dark:border-white/[0.07]"
        >
          <h2 id="matrix-title" class="text-base font-semibold tracking-tight">
            {{ t('schedule.matrixTitle') }}
          </h2>
          <p v-if="updatedAt" class="text-xs text-zinc-500 dark:text-zinc-400">
            {{ t('schedule.updatedAt', { time: updatedAt }) }}
          </p>
        </div>

        <div class="p-2 sm:p-3">
          <ScheduleMatrix
            :slots="schedule.allSlots"
            :counts="schedule.config.counts"
            :capacity="schedule.capacity"
            :occupancy-of="schedule.occupancyOf"
            :secondary-only="secondaryOnly"
          />
        </div>

        <div
          class="flex flex-col gap-3 border-t border-zinc-950/5 px-5 py-4 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.07] dark:text-zinc-400"
        >
          <ul class="flex flex-wrap gap-x-4 gap-y-1.5" :aria-label="t('common.legend')">
            <li class="flex items-center gap-1.5">
              <span class="size-2.5 rounded-sm bg-brand-400" aria-hidden="true" />
              {{ t('common.available') }}
            </li>
            <li v-if="schedule.capacity" class="flex items-center gap-1.5">
              <span class="size-2.5 rounded-sm bg-amber-400" aria-hidden="true" />
              {{ t('schedule.fillingLegend') }}
            </li>
            <li v-if="schedule.capacity" class="flex items-center gap-1.5">
              <span class="size-2.5 rounded-sm bg-rose-400" aria-hidden="true" />
              {{ t('common.full') }}
            </li>
            <li class="flex items-center gap-1.5">
              <span class="size-2.5 rounded-sm bg-zinc-200 dark:bg-zinc-700" aria-hidden="true" />
              {{ t('schedule.emptyLegend') }}
            </li>
          </ul>
          <p v-if="secondaryOnly.size">{{ t('schedule.secondaryOnly') }}</p>
        </div>
      </BaseCard>
    </template>
  </div>
</template>
