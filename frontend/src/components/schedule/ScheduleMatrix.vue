<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { dayName, timeRange } from '@/i18n/format'
import type { Occupancy } from '@/stores/schedule'
import type { Slot } from '@/types/booking'

const { t } = useI18n()

const props = defineProps<{
  slots: Slot[]
  counts: Record<string, number>
  capacity: number | null
  occupancyOf: (slot: string) => Occupancy
  /** Slots that can only be chosen for sessions 2 and 3. */
  secondaryOnly: Set<string>
}>()

const days = computed(() => {
  const seen = new Map<number, { dayIndex: number; day: string; dayShort: string }>()
  for (const s of props.slots) {
    if (!seen.has(s.dayIndex))
      seen.set(s.dayIndex, { dayIndex: s.dayIndex, day: s.day, dayShort: s.dayShort })
  }
  return [...seen.values()].sort((a, b) => a.dayIndex - b.dayIndex)
})

/** One row per distinct time range; one cell per day (undefined = no class). */
const rows = computed(() => {
  const byKey = new Map<string, Slot>()
  const times = new Map<string, Slot>()
  for (const s of props.slots) {
    byKey.set(`${s.dayIndex}|${s.time}`, s)
    if (!times.has(s.time)) times.set(s.time, s)
  }
  return [...times.values()]
    .sort((a, b) => (a.start ?? 99) - (b.start ?? 99))
    .map((row) => ({
      time: row.time,
      label: timeRange(row),
      period: row.period,
      cells: days.value.map((d) => ({
        dayIndex: d.dayIndex,
        slot: byKey.get(`${d.dayIndex}|${row.time}`),
      })),
    }))
})

const TONES: Record<Occupancy, string> = {
  empty:
    'bg-zinc-50 text-zinc-500 ring-zinc-950/5 dark:bg-white/[0.03] dark:text-zinc-400 dark:ring-white/[0.06]',
  available:
    'bg-brand-50 text-brand-800 ring-brand-200/70 dark:bg-brand-400/10 dark:text-brand-200 dark:ring-brand-400/20',
  filling:
    'bg-amber-50 text-amber-800 ring-amber-200/80 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20',
  full: 'bg-rose-50 text-rose-700 ring-rose-200/80 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20',
}

function statusLabel(slot: Slot) {
  const count = props.counts[slot.value] ?? 0
  if (props.capacity === null) return count ? t('matrix.registered') : t('matrix.nobody')
  if (count >= props.capacity) return t('matrix.full')
  return t('matrix.seatsLeft', { n: props.capacity - count })
}
</script>

<template>
  <div class="overflow-x-auto overscroll-x-contain">
    <table class="w-full min-w-[34rem] border-separate border-spacing-1.5 text-left">
      <caption class="sr-only">
        {{
          t('matrix.caption')
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col" class="sticky left-0 z-10 w-24 bg-white sm:w-28 dark:bg-zinc-900">
            <span class="sr-only">{{ t('matrix.slotColumn') }}</span>
          </th>
          <th
            v-for="day in days"
            :key="day.dayIndex"
            scope="col"
            class="px-1 pb-1 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400"
          >
            <span class="sm:hidden">{{ dayName(day, 'short') }}</span>
            <span class="hidden sm:inline">{{ dayName(day) }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.time">
          <th
            scope="row"
            class="sticky left-0 z-10 bg-white pr-2 align-middle whitespace-nowrap dark:bg-zinc-900"
          >
            <span class="block text-sm font-semibold tabular-nums">{{ row.label }}</span>
            <span v-if="row.period" class="block text-xs font-normal text-zinc-400">
              {{ t(`periods.${row.period}`) }}
            </span>
          </th>
          <td v-for="cell in row.cells" :key="cell.dayIndex" class="p-0">
            <div
              v-if="cell.slot"
              class="relative flex h-[4.25rem] flex-col justify-between rounded-xl px-2.5 py-2 ring-1"
              :class="TONES[occupancyOf(cell.slot.value)]"
              :title="
                t('matrix.cellTitle', {
                  slot: cell.slot.value,
                  count: `${counts[cell.slot.value] ?? 0}${capacity ? '/' + capacity : ''}`,
                })
              "
            >
              <span class="text-lg leading-none font-bold tabular-nums">
                {{ counts[cell.slot.value] ?? 0
                }}<span v-if="capacity" class="text-xs font-medium opacity-60"
                  >/{{ capacity }}</span
                >
              </span>
              <span class="hidden truncate text-[0.6875rem] font-medium sm:block">
                {{ statusLabel(cell.slot) }}
              </span>
              <span
                v-if="secondaryOnly.has(cell.slot.value)"
                class="absolute top-1.5 right-2 text-xs font-bold opacity-60"
                :title="t('matrix.secondaryOnly')"
                :aria-label="t('matrix.secondaryOnly')"
                >*</span
              >
            </div>
            <div
              v-else
              class="h-[4.25rem] rounded-xl border border-dashed border-zinc-200 dark:border-white/[0.07]"
            >
              <span class="sr-only">{{ t('matrix.noClass') }}</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
