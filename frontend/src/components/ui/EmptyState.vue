<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(
  defineProps<{
    icon?: Component
    title: string
    description?: string
    tone?: 'neutral' | 'danger'
  }>(),
  { tone: 'neutral' },
)
</script>

<template>
  <div class="flex flex-col items-center px-6 py-14 text-center">
    <div
      v-if="icon"
      class="grid size-12 place-items-center rounded-2xl ring-1"
      :class="
        tone === 'danger'
          ? 'bg-rose-50 text-rose-500 ring-rose-200/70 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20'
          : 'bg-zinc-100 text-zinc-500 ring-zinc-950/5 dark:bg-white/5 dark:text-zinc-400 dark:ring-white/10'
      "
    >
      <component :is="icon" class="size-6" aria-hidden="true" />
    </div>
    <h2 class="mt-4 text-lg font-semibold tracking-tight text-balance">{{ title }}</h2>
    <p
      v-if="description"
      class="mt-1.5 max-w-md text-sm leading-relaxed text-pretty text-zinc-500 dark:text-zinc-400"
    >
      {{ description }}
    </p>
    <div v-if="$slots.default" class="mt-6 flex flex-wrap justify-center gap-2">
      <slot />
    </div>
  </div>
</template>
