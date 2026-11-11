<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { CalendarClock, CalendarDays, PenLine } from '@lucide/vue'

import { useClubName } from '@/composables/useClubName'
import { appConfig } from '@/config/app'
import AppLogo from './AppLogo.vue'
import LocaleSwitcher from './LocaleSwitcher.vue'
import ThemeToggle from './ThemeToggle.vue'
import UserMenu from './UserMenu.vue'

const { t } = useI18n()
const clubName = useClubName()

const LINKS = [
  { name: 'booking', labelKey: 'nav.booking', icon: PenLine },
  { name: 'edit', labelKey: 'nav.edit', icon: CalendarClock },
  { name: 'schedule', labelKey: 'nav.schedule', icon: CalendarDays },
] as const
</script>

<template>
  <header
    class="sticky top-0 z-40 border-b border-zinc-950/5 bg-zinc-50/75 backdrop-blur-xl dark:border-white/[0.07] dark:bg-zinc-950/70"
  >
    <div
      class="mx-auto flex h-16 max-w-6xl items-center gap-1 px-4 min-[380px]:gap-2 sm:gap-3 sm:px-6"
    >
      <RouterLink
        :to="{ name: 'booking' }"
        class="mr-auto flex min-w-9 items-center gap-2.5 rounded-lg"
        :aria-label="t('app.home', { club: clubName })"
      >
        <AppLogo class="size-9 shrink-0" />
        <span class="hidden min-w-0 leading-tight md:block">
          <span class="block truncate text-sm font-bold tracking-tight">{{ clubName }}</span>
          <span class="block text-xs text-zinc-500 dark:text-zinc-400">{{ t('app.tagline') }}</span>
        </span>
        <span
          v-if="appConfig.demoMode"
          class="hidden rounded-full bg-amber-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-amber-800 sm:inline-block dark:bg-amber-400/15 dark:text-amber-200"
        >
          {{ t('app.demo') }}
        </span>
      </RouterLink>

      <nav
        class="flex items-center gap-0.5 rounded-xl bg-zinc-950/[0.04] p-1 sm:gap-1 dark:bg-white/5"
        :aria-label="t('nav.label')"
      >
        <RouterLink
          v-for="link in LINKS"
          :key="link.name"
          :to="{ name: link.name }"
          class="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[0.8125rem] font-medium whitespace-nowrap text-zinc-600 transition hover:text-zinc-900 aria-[current=page]:bg-white aria-[current=page]:text-zinc-900 aria-[current=page]:shadow-sm min-[380px]:px-2.5 min-[380px]:text-sm sm:px-3 dark:text-zinc-400 dark:hover:text-white dark:aria-[current=page]:bg-zinc-700 dark:aria-[current=page]:text-white"
        >
          <component :is="link.icon" class="hidden size-4 sm:block" aria-hidden="true" />
          {{ t(link.labelKey) }}
        </RouterLink>
      </nav>

      <LocaleSwitcher />
      <ThemeToggle />
      <UserMenu />
    </div>
  </header>
</template>
