<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { LockKeyhole, ShieldCheck } from '@lucide/vue'

import { useClubName } from '@/composables/useClubName'
import { appConfig } from '@/config/app'

const { t } = useI18n()
const clubName = useClubName()
const year = new Date().getFullYear()
</script>

<template>
  <footer class="border-t border-zinc-950/5 dark:border-white/[0.07]">
    <div
      class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-zinc-500 sm:flex-row sm:px-6 dark:text-zinc-400"
    >
      <p>© {{ year }} {{ clubName }}</p>
      <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <RouterLink
          :to="{ name: 'privacy' }"
          class="flex items-center gap-1.5 font-medium hover:text-zinc-900 dark:hover:text-white"
        >
          <LockKeyhole class="size-3.5" aria-hidden="true" />
          {{ t('footer.privacy') }}
        </RouterLink>
        <!-- Staff entrance; the guard sends signed-out visitors to the sign-in page. -->
        <RouterLink
          v-if="!appConfig.demoMode"
          :to="{ name: 'admin' }"
          class="flex items-center gap-1.5 font-medium hover:text-zinc-900 dark:hover:text-white"
        >
          <ShieldCheck class="size-3.5" aria-hidden="true" />
          {{ t('footer.admin') }}
        </RouterLink>
        <p v-if="appConfig.demoMode" class="flex items-center gap-1.5">
          <span class="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
          {{ t('footer.demo') }}
        </p>
      </div>
    </div>
  </footer>
</template>
