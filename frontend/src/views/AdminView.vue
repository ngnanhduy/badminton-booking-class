<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { CalendarCog, ClipboardList, UsersRound } from '@lucide/vue'

import AdminBookings from '@/components/admin/AdminBookings.vue'
import AdminSettings from '@/components/admin/AdminSettings.vue'
import AdminUsers from '@/components/admin/AdminUsers.vue'
import { useScheduleStore } from '@/stores/schedule'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const schedule = useScheduleStore()

onMounted(() => schedule.load({ force: true }))

const TABS = [
  { id: 'dang-ky', labelKey: 'admin.tabBookings', icon: ClipboardList, component: AdminBookings },
  { id: 'cai-dat', labelKey: 'admin.tabSettings', icon: CalendarCog, component: AdminSettings },
  { id: 'quan-tri-vien', labelKey: 'admin.tabUsers', icon: UsersRound, component: AdminUsers },
] as const

const active = computed(() => TABS.find((tab) => tab.id === route.query.tab) ?? TABS[0])

function select(id: string) {
  router.replace({ query: { ...route.query, tab: id } })
}

const stats = computed(() => {
  const c = schedule.config
  if (!c) return null
  return [
    { label: t('admin.statStudents'), value: c.totalBookings },
    { label: t('admin.statSeats'), value: schedule.totalSeatsTaken },
    {
      label: t('admin.statStatus'),
      value: c.open ? t('admin.statusOpen') : t('admin.statusClosed'),
    },
  ]
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
    <header
      class="flex animate-fade-in-up flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"
    >
      <div>
        <span
          v-if="schedule.config"
          class="inline-flex items-center rounded-full bg-brand-600/10 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-600/15 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20"
        >
          {{ t('common.week', { week: schedule.config.weekLabel }) }}
        </span>
        <h1
          class="mt-4 text-4xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl dark:text-white"
        >
          {{ t('titles.admin') }}
        </h1>
        <p class="mt-3 max-w-xl leading-relaxed text-zinc-600 dark:text-zinc-400">
          {{ t('admin.intro') }}
        </p>
      </div>
      <dl v-if="stats" class="grid grid-cols-3 gap-2 sm:gap-3">
        <div
          v-for="s in stats"
          :key="s.label"
          class="rounded-2xl bg-white/90 px-4 py-3 ring-1 ring-zinc-950/[0.06] dark:bg-zinc-900/70 dark:ring-white/10"
        >
          <dt class="text-xs text-zinc-500 dark:text-zinc-400">{{ s.label }}</dt>
          <dd class="mt-0.5 text-lg font-bold tracking-tight whitespace-nowrap tabular-nums">
            {{ s.value }}
          </dd>
        </div>
      </dl>
    </header>

    <div
      class="mt-8 flex gap-1 overflow-x-auto rounded-xl bg-zinc-950/[0.04] p-1 sm:inline-flex dark:bg-white/5"
      role="tablist"
      :aria-label="t('admin.tabsLabel')"
    >
      <button
        v-for="tab in TABS"
        :id="`tab-${tab.id}`"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="active.id === tab.id"
        :aria-controls="`panel-${tab.id}`"
        class="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition sm:flex-none sm:px-4"
        :class="
          active.id === tab.id
            ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
            : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
        "
        @click="select(tab.id)"
      >
        <component :is="tab.icon" class="hidden size-4 sm:block" aria-hidden="true" />
        {{ t(tab.labelKey) }}
      </button>
    </div>

    <section
      :id="`panel-${active.id}`"
      class="mt-6"
      role="tabpanel"
      :aria-labelledby="`tab-${active.id}`"
    >
      <KeepAlive>
        <component :is="active.component" :key="active.id" />
      </KeepAlive>
    </section>
  </div>
</template>
