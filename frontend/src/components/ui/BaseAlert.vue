<script setup lang="ts">
import { computed } from 'vue'
import { CircleAlert, CircleCheck, Info, TriangleAlert } from '@lucide/vue'

type Tone = 'info' | 'success' | 'warning' | 'danger'

const props = withDefaults(defineProps<{ tone?: Tone; title?: string }>(), { tone: 'info' })

const TONES = {
  info: {
    icon: Info,
    box: 'bg-sky-50 text-sky-900 ring-sky-200/70 dark:bg-sky-400/10 dark:text-sky-100 dark:ring-sky-400/20',
    iconClass: 'text-sky-500 dark:text-sky-300',
  },
  success: {
    icon: CircleCheck,
    box: 'bg-brand-50 text-brand-900 ring-brand-200/70 dark:bg-brand-400/10 dark:text-brand-100 dark:ring-brand-400/20',
    iconClass: 'text-brand-600 dark:text-brand-300',
  },
  warning: {
    icon: TriangleAlert,
    box: 'bg-amber-50 text-amber-900 ring-amber-200/70 dark:bg-amber-400/10 dark:text-amber-100 dark:ring-amber-400/20',
    iconClass: 'text-amber-500 dark:text-amber-300',
  },
  danger: {
    icon: CircleAlert,
    box: 'bg-rose-50 text-rose-900 ring-rose-200/70 dark:bg-rose-500/10 dark:text-rose-100 dark:ring-rose-400/20',
    iconClass: 'text-rose-500 dark:text-rose-300',
  },
} satisfies Record<Tone, { icon: unknown; box: string; iconClass: string }>

const tone = computed(() => TONES[props.tone])
</script>

<template>
  <div
    class="flex gap-3 rounded-xl p-3.5 text-sm ring-1"
    :class="tone.box"
    :role="props.tone === 'danger' ? 'alert' : 'status'"
  >
    <component :is="tone.icon" class="mt-0.5 size-4.5 shrink-0" :class="tone.iconClass" />
    <div class="min-w-0 flex-1 leading-relaxed">
      <p v-if="title" class="font-semibold">{{ title }}</p>
      <slot />
    </div>
  </div>
</template>
