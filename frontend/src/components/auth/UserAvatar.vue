<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name: string; size?: 'sm' | 'md' | 'lg' }>(), {
  size: 'md',
})

/** Initials from the last and first word (Vietnamese names put the given name last). */
const initials = computed(() => {
  const words = props.name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const first = words[words.length - 1]!
  const second = words.length > 1 ? words[0]! : ''
  return (second.charAt(0) + first.charAt(0)).toUpperCase()
})

const SIZES = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-lg' }
</script>

<template>
  <span
    class="grid shrink-0 place-items-center rounded-full bg-linear-to-br from-brand-500 to-lime-500 font-bold text-white ring-2 ring-white dark:from-brand-400 dark:to-lime-400 dark:text-brand-950 dark:ring-zinc-900"
    :class="SIZES[size]"
    aria-hidden="true"
  >
    {{ initials }}
  </span>
</template>
