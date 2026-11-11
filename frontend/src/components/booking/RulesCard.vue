<script setup lang="ts">
import { ShieldCheck } from '@lucide/vue'

import BaseCard from '@/components/ui/BaseCard.vue'

defineProps<{ rules: string[] }>()
</script>

<template>
  <BaseCard v-if="rules.length" class="animate-fade-in-up">
    <div class="flex items-center gap-2.5">
      <span
        class="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-400/10 dark:text-brand-300"
      >
        <ShieldCheck class="size-4.5" aria-hidden="true" />
      </span>
      <h2 class="text-base font-semibold tracking-tight">{{ $t('rules.title') }}</h2>
    </div>
    <ol class="mt-4 space-y-3">
      <li
        v-for="(rule, index) in rules"
        :key="rule"
        class="flex gap-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300"
      >
        <span
          class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-zinc-100 text-[0.6875rem] font-bold text-zinc-500 tabular-nums dark:bg-white/10 dark:text-zinc-400"
        >
          {{ index + 1 }}
        </span>
        <span>{{ rule }}</span>
      </li>
    </ol>
  </BaseCard>
</template>
