<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check } from '@lucide/vue'

import OccupancyMeter from '@/components/ui/OccupancyMeter.vue'
import { timeRange } from '@/i18n/format'
import type { Slot } from '@/types/booking'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    option: Slot
    selected: boolean
    count: number
    capacity: number | null
    /** 1-based number of another session already using this slot, or 0. */
    takenBy: number
    /** 1-based number of another session already on this slot's day, or 0. */
    sameDayAs?: number
  }>(),
  { sameDayAs: 0 },
)

const emit = defineEmits<{ select: [value: string] }>()

const full = computed(() => props.capacity !== null && props.count >= props.capacity)
const filling = computed(
  () => props.capacity !== null && !full.value && props.count / props.capacity >= 0.75,
)
const blocked = computed(() => props.takenBy > 0 || props.sameDayAs > 0)
const disabled = computed(() => !props.selected && (full.value || blocked.value))

/** Status line. `short` fits a narrow chip; `full` (when set) is read by screen readers. */
const meta = computed<{ short: string; full?: string }>(() => {
  if (props.takenBy) {
    return {
      short: t('common.session', { n: props.takenBy }),
      full: t('slot.takenBy', { n: props.takenBy }),
    }
  }
  if (props.sameDayAs && !props.selected) {
    return { short: t('slot.sameDay'), full: t('slot.sameDayAs', { n: props.sameDayAs }) }
  }
  if (full.value && !props.selected) return { short: t('slot.full') }
  if (props.capacity !== null) {
    const n = Math.max(0, props.capacity - props.count)
    return { short: t('slot.seatsLeft', { n }, n) }
  }
  return { short: props.count ? t('slot.people', { n: props.count }, props.count) : '' }
})

const metaClass = computed(() => {
  if (props.selected) return 'opacity-85'
  if (props.takenBy) return 'font-medium text-brand-700 dark:text-brand-300'
  if (disabled.value) return ''
  if (filling.value) return 'font-medium text-amber-600 dark:text-amber-400'
  return 'text-zinc-500 dark:text-zinc-400'
})
</script>

<template>
  <button
    type="button"
    class="flex w-full min-w-0 flex-col rounded-xl px-3 py-2 text-left ring-1 transition duration-150"
    :class="
      selected
        ? 'bg-brand-600 text-white shadow-md shadow-brand-600/25 ring-brand-600 dark:bg-brand-500 dark:text-brand-950 dark:ring-brand-500'
        : takenBy
          ? 'cursor-not-allowed bg-brand-50/60 text-zinc-500 ring-brand-500/40 dark:bg-brand-400/5 dark:text-zinc-400 dark:ring-brand-400/30'
          : disabled
            ? 'cursor-not-allowed bg-zinc-50 text-zinc-400 ring-zinc-950/5 dark:bg-white/[0.02] dark:text-zinc-600 dark:ring-white/5'
            : 'bg-white text-zinc-900 ring-zinc-950/10 hover:-translate-y-px hover:shadow-md hover:ring-brand-400 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-white/10 dark:hover:ring-brand-400/70'
    "
    :disabled="disabled"
    :aria-pressed="selected"
    :data-testid="`slot-${option.value}`"
    @click="emit('select', option.value)"
  >
    <!-- Phones: status under the time. Wider screens: on the same line, pushed right. -->
    <span class="flex flex-wrap items-center gap-x-1.5">
      <span class="text-sm font-semibold whitespace-nowrap tabular-nums">
        {{ timeRange(option) }}
      </span>
      <span
        v-if="meta.short"
        class="order-last mt-0.5 w-full text-xs leading-snug sm:order-none sm:mt-0 sm:ml-auto sm:w-auto"
        :class="metaClass"
      >
        <span :aria-hidden="meta.full ? true : undefined">{{ meta.short }}</span>
        <span v-if="meta.full" class="sr-only">{{ meta.full }}</span>
      </span>
      <span
        v-if="selected"
        class="ml-auto grid size-4.5 shrink-0 animate-pop place-items-center rounded-full bg-white/25 sm:ml-0"
        aria-hidden="true"
      >
        <Check class="size-3" stroke-width="3.5" />
      </span>
    </span>
    <span v-if="capacity !== null && !blocked" class="mt-1.5 block">
      <OccupancyMeter :count="count" :capacity="capacity" :inverted="selected" />
    </span>
  </button>
</template>
