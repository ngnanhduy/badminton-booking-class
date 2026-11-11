<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    count: number
    capacity: number | null
    /** Light-on-dark styling for use on a selected (filled) background. */
    inverted?: boolean
  }>(),
  { inverted: false },
)

const ratio = computed(() =>
  props.capacity ? Math.min(1, props.count / props.capacity) : props.count ? 1 : 0,
)

const barClass = computed(() => {
  if (props.inverted) return 'bg-white'
  if (ratio.value >= 1) return 'bg-rose-500'
  if (ratio.value >= 0.75) return 'bg-amber-500'
  return 'bg-brand-500'
})
</script>

<template>
  <div
    class="h-1.5 w-full overflow-hidden rounded-full"
    :class="inverted ? 'bg-white/30' : 'bg-zinc-200/80 dark:bg-white/10'"
    role="meter"
    :aria-valuenow="count"
    :aria-valuemin="0"
    :aria-valuemax="capacity ?? undefined"
    :aria-label="
      capacity ? $t('slot.booked', { count, capacity }) : $t('slot.registered', { count })
    "
  >
    <div
      class="h-full rounded-full transition-[width] duration-500 ease-out"
      :class="barClass"
      :style="{ width: `${Math.round(ratio * 100)}%` }"
    />
  </div>
</template>
