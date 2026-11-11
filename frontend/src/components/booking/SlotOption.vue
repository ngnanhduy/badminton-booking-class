<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Moon, Sun, Sunrise } from '@lucide/vue'

import OccupancyMeter from '@/components/ui/OccupancyMeter.vue'
import { timeRange } from '@/i18n/format'
import type { Slot } from '@/types/booking'

const { t } = useI18n()

const props = defineProps<{
  option: Slot
  selected: boolean
  count: number
  capacity: number | null
  /** 1-based number of another session already using this slot, or 0. */
  takenBy: number
}>()

const emit = defineEmits<{ select: [value: string] }>()

const full = computed(() => props.capacity !== null && props.count >= props.capacity)
const disabled = computed(() => !props.selected && (full.value || props.takenBy > 0))

const PERIOD_ICONS = { morning: Sunrise, afternoon: Sun, evening: Moon } as const

const periodIcon = computed(() => (props.option.period ? PERIOD_ICONS[props.option.period] : Sun))

const meta = computed(() => {
  if (props.takenBy) return t('slot.takenBy', { n: props.takenBy })
  if (full.value && !props.selected) return t('slot.full')
  const period = props.option.period ? t(`periods.${props.option.period}`) : ''
  let seats = ''
  if (props.capacity !== null) {
    const n = Math.max(0, props.capacity - props.count)
    seats = t('slot.seatsLeft', { n }, n)
  } else if (props.count) seats = t('slot.people', { n: props.count }, props.count)
  return [period, seats].filter(Boolean).join(' · ')
})
</script>

<template>
  <button
    type="button"
    class="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition duration-150"
    :class="
      selected
        ? 'bg-brand-600 text-white shadow-md shadow-brand-600/25 ring-brand-600 dark:bg-brand-500 dark:text-brand-950 dark:ring-brand-500'
        : disabled
          ? 'cursor-not-allowed bg-zinc-50 text-zinc-400 ring-zinc-950/5 dark:bg-white/[0.02] dark:text-zinc-600 dark:ring-white/5'
          : 'bg-white text-zinc-900 ring-zinc-950/10 hover:-translate-y-px hover:shadow-md hover:ring-brand-400 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-white/10 dark:hover:ring-brand-400/70'
    "
    :disabled="disabled"
    :aria-pressed="selected"
    :data-testid="`slot-${option.value}`"
    @click="emit('select', option.value)"
  >
    <component
      :is="periodIcon"
      class="size-4 shrink-0"
      :class="
        selected
          ? 'opacity-90'
          : disabled
            ? 'opacity-60'
            : option.period === 'evening'
              ? 'text-indigo-400'
              : 'text-amber-500'
      "
      aria-hidden="true"
    />
    <span class="min-w-0 flex-1">
      <span class="block text-sm font-semibold whitespace-nowrap tabular-nums">
        {{ timeRange(option) }}
      </span>
      <span
        class="block truncate text-xs"
        :class="selected ? 'opacity-85' : 'text-zinc-500 dark:text-zinc-400'"
      >
        {{ meta }}
      </span>
    </span>
    <span v-if="capacity !== null && !takenBy" class="w-10 shrink-0">
      <OccupancyMeter :count="count" :capacity="capacity" :inverted="selected" />
    </span>
    <span
      v-if="selected"
      class="grid size-5 shrink-0 animate-pop place-items-center rounded-full bg-white/25"
      aria-hidden="true"
    >
      <Check class="size-3.5" stroke-width="3.5" />
    </span>
  </button>
</template>
