<script setup lang="ts">
import { dayName } from '@/i18n/format'
import type { DayGroup } from '@/types/booking'
import SlotOption from './SlotOption.vue'

defineProps<{
  days: DayGroup[]
  /** Slot chosen for the session being edited. */
  selected: string
  capacity: number | null
  counts: Record<string, number>
  /** Slot value → 1-based number of another session that already uses it. */
  takenBy: Record<string, number>
  labelledBy?: string
}>()

const emit = defineEmits<{ select: [value: string] }>()
</script>

<template>
  <div
    id="session-panel"
    role="tabpanel"
    :aria-labelledby="labelledBy"
    class="grid gap-3 sm:grid-cols-2"
  >
    <div
      v-for="day in days"
      :key="day.day"
      class="rounded-2xl bg-zinc-50/80 p-2.5 ring-1 ring-zinc-950/[0.04] dark:bg-white/[0.02] dark:ring-white/[0.06]"
    >
      <div class="mb-2 flex items-center gap-2 px-1 pt-0.5">
        <span
          class="grid h-6 min-w-6 place-items-center rounded-md bg-white px-1 text-[0.6875rem] font-bold text-zinc-700 ring-1 ring-zinc-950/10 dark:bg-white/10 dark:text-zinc-200 dark:ring-white/10"
        >
          {{ dayName(day, 'short') }}
        </span>
        <span class="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{{
          dayName(day)
        }}</span>
      </div>
      <div class="space-y-2">
        <SlotOption
          v-for="slot in day.slots"
          :key="slot.value"
          :option="slot"
          :selected="selected === slot.value"
          :count="counts[slot.value] ?? 0"
          :capacity="capacity"
          :taken-by="takenBy[slot.value] ?? 0"
          @select="emit('select', $event)"
        />
      </div>
    </div>
  </div>
</template>
