<script setup lang="ts">
import { Check } from '@lucide/vue'

import { SESSION_COUNTS, type SessionCount } from '@/types/booking'

const model = defineModel<SessionCount | null>({ required: true })

defineProps<{ invalid?: boolean; describedBy?: string }>()
</script>

<template>
  <fieldset :aria-describedby="describedBy" :aria-invalid="invalid || undefined">
    <legend class="sr-only">{{ $t('form.step2Title') }}</legend>
    <div class="grid grid-cols-3 gap-2.5 sm:gap-3">
      <label
        v-for="n in SESSION_COUNTS"
        :key="n"
        class="group relative flex cursor-pointer flex-col items-center rounded-xl bg-white px-2 py-4 ring-1 transition duration-150 select-none hover:ring-brand-400 has-checked:bg-brand-50 has-checked:ring-2 has-checked:ring-brand-500 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-500 dark:bg-white/[0.03] dark:hover:ring-brand-400/60 dark:has-checked:bg-brand-400/10 dark:has-checked:ring-brand-400"
        :class="
          invalid ? 'ring-rose-300 dark:ring-rose-500/50' : 'ring-zinc-950/10 dark:ring-white/10'
        "
      >
        <input
          v-model="model"
          type="radio"
          name="session-count"
          :value="n"
          class="sr-only"
          :data-testid="`session-count-${n}`"
        />
        <span
          class="absolute top-2 right-2 grid size-4.5 place-items-center rounded-full bg-brand-600 text-white opacity-0 transition group-has-checked:opacity-100 dark:bg-brand-400 dark:text-brand-950"
          aria-hidden="true"
        >
          <Check class="size-3" stroke-width="3.5" />
        </span>
        <span
          class="text-3xl font-extrabold tracking-tight text-zinc-900 tabular-nums group-has-checked:text-brand-700 dark:text-white dark:group-has-checked:text-brand-300"
        >
          {{ n }}
        </span>
        <span
          class="mt-0.5 text-xs font-medium text-zinc-500 group-has-checked:text-brand-700/80 dark:text-zinc-400 dark:group-has-checked:text-brand-300/80"
        >
          {{ $t('form.perWeek', n) }}
        </span>
      </label>
    </div>
  </fieldset>
</template>
