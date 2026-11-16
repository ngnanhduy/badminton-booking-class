<script setup lang="ts">
import { computed, onMounted, watchEffect } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

import AppFooter from '@/components/layout/AppFooter.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import PageUnavailable from '@/components/layout/PageUnavailable.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import { useClubName } from '@/composables/useClubName'
import { usePages } from '@/composables/usePages'
import { isPageId } from '@/config/pages'
import { useScheduleStore } from '@/stores/schedule'

const route = useRoute()
const { t } = useI18n()
const clubName = useClubName()
const schedule = useScheduleStore()
const { canView, isEnabled } = usePages()

// Which pages are on comes with the schedule; the menu needs it on every page.
onMounted(() => schedule.load())

/** The public page being shown, when it's one admins can turn off. */
const page = computed(() => (isPageId(route.name) ? route.name : null))
/** Turned off and this visitor isn't an admin: a notice is shown instead. */
const blocked = computed(() => !!page.value && !canView(page.value))
/** An admin looking at a turned-off page. */
const previewing = computed(() => !!page.value && !blocked.value && !isEnabled(page.value))

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
      <div v-if="previewing" class="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <BaseAlert tone="warning">
          {{ t('pages.previewNotice') }}
          <RouterLink
            :to="{ name: 'admin', query: { tab: 'trang' } }"
            class="font-semibold underline decoration-amber-500/50 underline-offset-4 hover:decoration-amber-500"
          >
            {{ t('pages.manage') }}
          </RouterLink>
        </BaseAlert>
      </div>
      <RouterView v-slot="{ Component, route: current }">
        <Transition name="page" mode="out-in">
          <PageUnavailable v-if="blocked && page" :key="`off:${page}`" :page="page" />
          <component :is="Component" v-else :key="current.name ?? current.path" />
        </Transition>
      </RouterView>
    </main>

    <AppFooter />
  </div>
</template>
