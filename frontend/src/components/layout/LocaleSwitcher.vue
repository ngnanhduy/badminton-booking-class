<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Languages } from '@lucide/vue'

import { setLocale, type Locale } from '@/i18n'

const { t, locale } = useI18n()

const next = computed<Locale>(() => (locale.value === 'vi' ? 'en' : 'vi'))
</script>

<template>
  <!-- Shows the language you switch TO, labelled in that language. -->
  <button
    type="button"
    class="flex h-9 items-center gap-1 rounded-lg px-1.5 text-xs font-bold text-zinc-600 transition hover:bg-zinc-950/5 hover:text-zinc-900 sm:px-2 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white"
    :title="t('language.switchTo')"
    :aria-label="t('language.switchTo')"
    :lang="next"
    data-testid="locale-switch"
    @click="setLocale(next)"
  >
    <Languages class="hidden size-4 sm:block" aria-hidden="true" />
    {{ t('language.targetShort') }}
  </button>
</template>
