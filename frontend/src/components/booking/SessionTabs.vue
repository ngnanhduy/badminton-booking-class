<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check } from '@lucide/vue'

import { slotShort } from '@/i18n/format'
import { parseSlot } from '@/utils/slots'

const { t } = useI18n()

const props = defineProps<{
  /** Chosen slot per session; only the first `count` entries are shown. */
  slots: string[]
  count: number
  /** Session indexes that currently have a validation error. */
  invalid?: number[]
}>()

const active = defineModel<number>({ required: true })

const GRID_COLS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' }

const tabs = computed(() =>
  Array.from({ length: props.count }, (_, index) => {
    const value = props.slots[index] ?? ''
    const slot = value ? parseSlot(value) : null
    return {
      index,
      value,
      summary: slot ? slotShort(slot) : t('common.notChosen'),
      invalid: props.invalid?.includes(index) ?? false,
    }
  }),
)

function onKeydown(event: KeyboardEvent) {
  const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (!delta) return
  event.preventDefault()
  active.value = (active.value + delta + props.count) % props.count
  const tab = document.getElementById(`session-tab-${active.value}`)
  tab?.focus()
}
</script>

<template>
  <div
    role="tablist"
    :aria-label="t('form.tabsLabel')"
    class="grid gap-2"
    :class="GRID_COLS[count] ?? 'grid-cols-3'"
    @keydown="onKeydown"
  >
    <button
      v-for="tab in tabs"
      :id="`session-tab-${tab.index}`"
      :key="tab.index"
      type="button"
      role="tab"
      :aria-selected="active === tab.index"
      :tabindex="active === tab.index ? 0 : -1"
      aria-controls="session-panel"
      class="relative min-w-0 rounded-xl px-3 py-2.5 text-left transition duration-150"
      :class="[
        active === tab.index
          ? 'bg-zinc-900 text-white shadow-md shadow-zinc-900/15 dark:bg-white dark:text-zinc-900'
          : 'bg-zinc-100/80 text-zinc-700 hover:bg-zinc-200/70 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10',
        tab.invalid && active !== tab.index && 'ring-2 ring-rose-400 dark:ring-rose-500/60',
      ]"
      @click="active = tab.index"
    >
      <span
        class="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wider uppercase opacity-70"
      >
        {{ t('common.session', { n: tab.index + 1 }) }}
        <Check v-if="tab.value" class="size-3.5 text-brand-500" stroke-width="3" />
      </span>
      <span
        class="mt-0.5 block truncate text-sm font-semibold"
        :class="!tab.value && 'font-medium opacity-60'"
      >
        {{ tab.summary }}
      </span>
    </button>
  </div>
</template>
