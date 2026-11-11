<script setup lang="ts">
import { watchEffect } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

import AppFooter from '@/components/layout/AppFooter.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import { useClubName } from '@/composables/useClubName'

const route = useRoute()
const { t } = useI18n()
const clubName = useClubName()

// Page title follows the route and the current language.
watchEffect(() => {
  const title = route.meta.titleKey ? t(route.meta.titleKey) : ''
  document.title = title ? `${title} · ${clubName.value}` : clubName.value
})
</script>

<template>
  <div class="relative isolate flex min-h-dvh flex-col overflow-x-clip">
    <!-- Decorative background: court grid + soft brand glow -->
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem] bg-court-grid [mask-image:radial-gradient(ellipse_75%_65%_at_50%_0%,black,transparent)]"
    />
    <div
      aria-hidden="true"
      class="pointer-events-none absolute top-[-12rem] left-1/2 -z-10 h-[30rem] w-[60rem] -translate-x-1/2 rounded-full bg-linear-to-tr from-brand-300/40 via-lime-200/30 to-sky-200/30 blur-3xl dark:from-brand-500/15 dark:via-lime-400/5 dark:to-sky-500/10"
    />

    <AppHeader />

    <main class="flex-1">
      <RouterView v-slot="{ Component, route: current }">
        <Transition name="page" mode="out-in">
          <component :is="Component" :key="current.name ?? current.path" />
        </Transition>
      </RouterView>
    </main>

    <AppFooter />
  </div>
</template>
