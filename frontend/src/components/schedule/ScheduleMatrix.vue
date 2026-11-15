<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import OccupancyMeter from '@/components/ui/OccupancyMeter.vue'
import { dayName, timeRange } from '@/i18n/format'
import type { Occupancy } from '@/stores/schedule'
import type { Slot } from '@/types/booking'
import { dayMonth, dayTiming, weekDayDate, type DayTiming } from '@/utils/week'

const { t } = useI18n()

const props = defineProps<{
  slots: Slot[]
  counts: Record<string, number>
  capacity: number | null
  occupancyOf: (slot: string) => Occupancy
  /** The week shown, to put a date on each day. */
  week: { weekLabel: string; startDate: string | null }
}>()

interface Day {
  dayIndex: number
  /** "10/11", or "" when the week has no readable date. */
  date: string
  timing: DayTiming | null
  /** The day's slots, earliest first. */
  slots: Slot[]
}

/** Days that have a class, Mon → Sun. */
const days = computed<Day[]>(() => {
  const now = new Date()
  const byDay = new Map<number, Slot[]>()
  for (const s of props.slots) {
    const list = byDay.get(s.dayIndex)
    if (list) list.push(s)
    else byDay.set(s.dayIndex, [s])
  }
  return [...byDay]
    .sort(([a], [b]) => a - b)
    .map(([dayIndex, slots]) => {
      const date = weekDayDate(props.week, dayIndex, now)
      return {
        dayIndex,
        date: date ? dayMonth(date) : '',
        timing: date ? dayTiming(date, now) : null,
        slots: [...slots].sort((a, b) => (a.start ?? 99) - (b.start ?? 99)),
      }
    })
})

/** One row per distinct time range; one cell per day (undefined = no class). */
const rows = computed(() => {
  const times = new Map<string, Slot>()
  for (const s of props.slots) if (!times.has(s.time)) times.set(s.time, s)
  return [...times.values()]
    .sort((a, b) => (a.start ?? 99) - (b.start ?? 99))
    .map((row) => ({
      time: row.time,
      label: timeRange(row),
      period: row.period,
      cells: days.value.map((d) => ({
        day: d,
        slot: d.slots.find((s) => s.time === row.time),
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

const countOf = (slot: Slot) => props.counts[slot.value] ?? 0

function statusLabel(slot: Slot) {
  const count = countOf(slot)
  if (props.capacity === null) return count ? t('matrix.registered') : t('matrix.nobody')
  if (count >= props.capacity) return t('matrix.full')
  return t('matrix.seatsLeft', { n: props.capacity - count })
}

function cellTitle(slot: Slot) {
  const count = `${countOf(slot)}${props.capacity ? '/' + props.capacity : ''}`
  return t('matrix.cellTitle', { slot: slot.value, count })
}
</script>

<template>
  <!-- Tablets and up: days across, times down. -->
  <div class="hidden overflow-x-auto overscroll-x-contain sm:block">
    <table class="w-full min-w-[38rem] border-separate border-spacing-1.5 text-left">
      <caption class="sr-only">
        {{
          t('matrix.caption')
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col" class="sticky left-0 z-10 w-28 bg-white dark:bg-zinc-900">
            <span class="sr-only">{{ t('matrix.slotColumn') }}</span>
          </th>
          <th
            v-for="day in days"
            :key="day.dayIndex"
            scope="col"
            class="px-0.5 pb-1 text-center align-bottom"
            :aria-current="day.timing === 'today' ? 'date' : undefined"
          >
            <span
              class="inline-flex min-w-[4.5rem] flex-col items-center rounded-lg px-2 py-1 leading-tight"
              :class="
                day.timing === 'today'
                  ? 'bg-brand-600 text-white dark:bg-brand-500 dark:text-brand-950'
                  : day.timing === 'past'
                    ? 'text-zinc-400 dark:text-zinc-500'
                    : 'text-zinc-700 dark:text-zinc-200'
              "
            >
              <span class="text-xs font-semibold">
                <span class="lg:hidden">{{ dayName(day.slots[0]!, 'short') }}</span>
                <span class="hidden lg:inline">{{ dayName(day.slots[0]!) }}</span>
              </span>
              <span
                v-if="day.date"
                class="text-[0.6875rem] font-medium tabular-nums"
                :class="day.timing !== 'today' && 'opacity-70'"
              >
                {{ day.timing === 'today' ? t('matrix.today') : day.date }}
              </span>
            </span>
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
          <td
            v-for="cell in row.cells"
            :key="cell.day.dayIndex"
            class="p-0"
            :class="cell.day.timing === 'past' && 'opacity-45'"
          >
            <div
              v-if="cell.slot"
              class="flex h-[4.75rem] flex-col rounded-xl px-2.5 pt-2 pb-2.5 ring-1"
              :class="TONES[occupancyOf(cell.slot.value)]"
              :title="cellTitle(cell.slot)"
            >
              <span class="text-lg leading-none font-bold tabular-nums">
                {{ countOf(cell.slot)
                }}<span v-if="capacity" class="text-xs font-medium opacity-60"
                  >/{{ capacity }}</span
                >
              </span>
              <span class="mt-1 truncate text-[0.6875rem] font-medium">
                {{ statusLabel(cell.slot) }}
              </span>
              <OccupancyMeter
                v-if="capacity"
                class="mt-auto"
                :count="countOf(cell.slot)"
                :capacity="capacity"
              />
            </div>
            <div v-else class="h-[4.75rem] rounded-xl bg-zinc-950/[0.02] dark:bg-white/[0.015]">
              <span class="sr-only">{{ t('matrix.noClass') }}</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Phones: one list per day, so nothing scrolls sideways. -->
  <div class="space-y-5 p-1 sm:hidden">
    <section
      v-for="day in days"
      :key="day.dayIndex"
      :aria-current="day.timing === 'today' ? 'date' : undefined"
    >
      <h3
        class="flex items-center gap-2 px-1 text-sm font-semibold"
        :class="day.timing === 'past' && 'text-zinc-400 dark:text-zinc-500'"
      >
        {{ dayName(day.slots[0]!) }}
        <span v-if="day.date" class="font-normal text-zinc-500 tabular-nums dark:text-zinc-400">
          {{ day.date }}
        </span>
        <span
          v-if="day.timing === 'today'"
          class="rounded-full bg-brand-600 px-2 py-0.5 text-[0.6875rem] font-semibold text-white dark:bg-brand-500 dark:text-brand-950"
        >
          {{ t('matrix.today') }}
        </span>
      </h3>
      <ul class="mt-2 space-y-1.5" :class="day.timing === 'past' && 'opacity-45'">
        <li
          v-for="slot in day.slots"
          :key="slot.value"
          class="flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1"
          :class="TONES[occupancyOf(slot.value)]"
          :title="cellTitle(slot)"
        >
          <span class="w-[5.5rem] shrink-0">
            <span class="block text-sm font-semibold tabular-nums">{{ timeRange(slot) }}</span>
            <span v-if="slot.period" class="block text-[0.6875rem] opacity-70">
              {{ t(`periods.${slot.period}`) }}
            </span>
          </span>
          <OccupancyMeter
            v-if="capacity"
            class="min-w-0 flex-1"
            :count="countOf(slot)"
            :capacity="capacity"
          />
          <span v-else class="flex-1" />
          <span class="shrink-0 text-right">
            <span class="block text-base leading-tight font-bold tabular-nums">
              {{ countOf(slot)
              }}<span v-if="capacity" class="text-xs font-medium opacity-60">/{{ capacity }}</span>
            </span>
            <span class="block text-[0.6875rem] font-medium whitespace-nowrap">
              {{ statusLabel(slot) }}
            </span>
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>
