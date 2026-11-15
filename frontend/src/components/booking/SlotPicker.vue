<script setup lang="ts">
import { computed } from 'vue'

import { dayName } from '@/i18n/format'
import type { DayGroup } from '@/types/booking'
import SlotOption from './SlotOption.vue'

const props = defineProps<{
  days: DayGroup[]
  /** Slot chosen for the session being edited. */
  selected: string
  capacity: number | null
  counts: Record<string, number>
  /** Slot value → 1-based number of another session that already uses it. */
  takenBy: Record<string, number>
  /** Weekday index → 1-based number of another session already on that day. */
  dayTakenBy?: Record<number, number>
  /** id of the session tab that controls this panel; omit when there are no tabs. */
  labelledBy?: string
}>()

const emit = defineEmits<{ select: [value: string] }>()

/** Wider screens: as many columns as the busiest day has slots (2 or 3), so rows fill out. */
const SM_COLS: Record<number, string> = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }
const smCols = computed(() => {
  const most = Math.max(2, ...props.days.map((day) => day.slots.length))
  return SM_COLS[Math.min(3, most)]
})
</script>

<template>
  <!-- One compact row per day: the whole week fits on screen, times line up in columns. -->
  <div
    id="session-panel"
    :role="labelledBy ? 'tabpanel' : undefined"
    :aria-labelledby="labelledBy"
    class="divide-y divide-zinc-950/[0.06] rounded-2xl bg-zinc-50/80 ring-1 ring-zinc-950/[0.04] dark:divide-white/[0.06] dark:bg-white/[0.02] dark:ring-white/[0.06]"
  >
    <div
      v-for="day in days"
      :key="day.day"
      role="group"
      :aria-label="dayName(day)"
      class="flex items-center gap-2.5 p-2 sm:gap-3 sm:p-2.5"
    >
      <span
        class="w-8 shrink-0 text-center text-xs font-bold text-zinc-700 sm:w-18 sm:pl-1.5 sm:text-left sm:text-sm sm:font-semibold dark:text-zinc-200"
        aria-hidden="true"
      >
        <span class="sm:hidden">{{ dayName(day, 'short') }}</span>
        <span class="hidden sm:inline">{{ dayName(day) }}</span>
      </span>
      <div class="grid min-w-0 flex-1 grid-cols-2 gap-2" :class="smCols">
        <SlotOption
          v-for="slot in day.slots"
          :key="slot.value"
          :option="slot"
          :selected="selected === slot.value"
          :count="counts[slot.value] ?? 0"
          :capacity="capacity"
          :taken-by="takenBy[slot.value] ?? 0"
          :same-day-as="dayTakenBy?.[slot.dayIndex] ?? 0"
          @select="emit('select', $event)"
        />
      </div>
    </div>
  </div>
</template>
