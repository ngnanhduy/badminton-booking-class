<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useColorMode } from '@vueuse/core'
import { Monitor, Moon, Sun } from '@lucide/vue'

import { appConfig } from '@/config/app'

const { t } = useI18n()
const { store } = useColorMode({ storageKey: appConfig.storageKeys.colorScheme })

const OPTIONS = [
  { value: 'auto', labelKey: 'theme.auto', icon: Monitor },
  { value: 'light', labelKey: 'theme.light', icon: Sun },
  { value: 'dark', labelKey: 'theme.dark', icon: Moon },
] as const

const current = computed(() => OPTIONS.find((o) => o.value === store.value) ?? OPTIONS[0])

function cycle() {
  const index = OPTIONS.findIndex((o) => o.value === store.value)
  store.value = OPTIONS[(index + 1) % OPTIONS.length]!.value
}
</script>

<template>
  <!-- Compact cycling button on small screens -->
  <button
    type="button"
    class="grid size-9 place-items-center rounded-lg text-zinc-600 transition hover:bg-zinc-950/5 hover:text-zinc-900 sm:hidden dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white"
    :title="t(current.labelKey)"
    :aria-label="t('theme.change', { current: t(current.labelKey) })"
    @click="cycle"
  >
    <component :is="current.icon" class="size-4.5" aria-hidden="true" />
  </button>

  <!-- Segmented control on larger screens -->
  <div
    class="hidden items-center gap-0.5 rounded-xl bg-zinc-950/[0.04] p-1 sm:flex dark:bg-white/5"
    role="radiogroup"
    :aria-label="t('theme.group')"
  >
    <button
      v-for="option in OPTIONS"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="store === option.value"
      :title="t(option.labelKey)"
      class="grid size-7 place-items-center rounded-lg transition"
      :class="
        store === option.value
          ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
          : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
      "
      @click="store = option.value"
    >
      <component :is="option.icon" class="size-4" aria-hidden="true" />
      <span class="sr-only">{{ t(option.labelKey) }}</span>
    </button>
  </div>
</template>
