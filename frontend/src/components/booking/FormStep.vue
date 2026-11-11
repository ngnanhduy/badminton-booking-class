<script setup lang="ts">
import { Check } from '@lucide/vue'

import BaseCard from '@/components/ui/BaseCard.vue'

defineProps<{
  step: number
  title: string
  description?: string
  complete?: boolean
  optional?: boolean
  /** id of the heading, used to label the section. */
  headingId: string
}>()
</script>

<template>
  <BaseCard :aria-labelledby="headingId">
    <div class="flex items-start gap-3.5">
      <span
        class="grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors duration-300"
        :class="
          complete
            ? 'bg-brand-600 text-white dark:bg-brand-500 dark:text-brand-950'
            : 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:text-zinc-400 dark:ring-white/10'
        "
        aria-hidden="true"
      >
        <Check v-if="complete" class="size-4 animate-pop" stroke-width="3" />
        <template v-else>{{ step }}</template>
      </span>
      <div class="min-w-0 flex-1 pt-0.5">
        <div class="flex flex-wrap items-center gap-2">
          <h2 :id="headingId" class="text-base font-semibold tracking-tight">{{ title }}</h2>
          <span
            v-if="optional"
            class="rounded-full bg-zinc-100 px-2 py-0.5 text-[0.6875rem] font-medium text-zinc-500 dark:bg-white/10 dark:text-zinc-400"
          >
            {{ $t('common.optional') }}
          </span>
        </div>
        <p v-if="description" class="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
          {{ description }}
        </p>
      </div>
    </div>
    <div class="mt-5 sm:pl-[2.875rem]">
      <slot />
    </div>
  </BaseCard>
</template>
