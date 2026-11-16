<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { MAKEUP, type SessionFlags } from '@/utils/slotEditor'

/** "Buổi 1 2 3 | Bù": turns a slot on or off for each session of a booking and for make-up classes. */
const model = defineModel<SessionFlags>({ required: true })
defineProps<{ disabled?: boolean }>()

const { t } = useI18n()

const SESSIONS = [0, 1, 2] as const

function toggle(i: number) {
  model.value = model.value.map((on, j) => (j === i ? !on : on)) as SessionFlags
}

const pill = (on: boolean) =>
  on
    ? 'bg-brand-600 text-white ring-brand-600 dark:bg-brand-500 dark:text-brand-950 dark:ring-brand-500'
    : 'bg-white text-zinc-500 ring-zinc-950/10 hover:text-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-white/10 dark:hover:text-zinc-100'
const makeupPill = (on: boolean) =>
  on
    ? 'bg-amber-500 text-white ring-amber-500 dark:bg-amber-400 dark:text-amber-950 dark:ring-amber-400'
    : 'bg-white text-zinc-500 ring-zinc-950/10 hover:text-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-white/10 dark:hover:text-zinc-100'
</script>

<template>
  <div class="flex items-center gap-1" role="group" :aria-label="t('slotEditor.sessionsLabel')">
    <span class="mr-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400" aria-hidden="true">
      {{ t('slotEditor.sessionShort') }}
    </span>
    <button
      v-for="i in SESSIONS"
      :key="i"
      type="button"
      class="size-7 rounded-full text-xs font-semibold tabular-nums ring-1 transition disabled:opacity-60"
      :class="pill(model[i])"
      :aria-pressed="model[i]"
      :aria-label="t('slotEditor.session', { n: i + 1 })"
      :title="t('slotEditor.session', { n: i + 1 })"
      :disabled="disabled"
      @click="toggle(i)"
    >
      {{ i + 1 }}
    </button>
    <span class="mx-0.5 h-4 w-px bg-zinc-950/10 dark:bg-white/15" aria-hidden="true" />
    <button
      type="button"
      class="h-7 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap ring-1 transition disabled:opacity-60"
      :class="makeupPill(model[MAKEUP])"
      :aria-pressed="model[MAKEUP]"
      :aria-label="t('slotEditor.makeup')"
      :title="t('slotEditor.makeup')"
      :disabled="disabled"
      data-testid="makeup-toggle"
      @click="toggle(MAKEUP)"
    >
      {{ t('common.makeupShort') }}
    </button>
  </div>
</template>
