<script setup lang="ts">
import { computed, onActivated, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { CalendarRange, Clock } from '@lucide/vue'

import ClassScheduleForm from '@/components/admin/ClassScheduleForm.vue'
import WeeksPanel from '@/components/admin/WeeksPanel.vue'
import { useAdminWeeks } from '@/composables/useAdminWeeks'

/**
 * Class settings, in two tabs: opening and closing weeks, and each week's class times.
 * The tab is kept in the URL (`?muc=`); edits in one tab survive switching to the other.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { load } = useAdminWeeks()

onMounted(() => load())
// Back on this page: refresh the counts (unsaved edits are kept).
onActivated(() => load({ force: true }))

const SECTIONS = [
  { id: 'mo-dong-tuan', labelKey: 'adminSettings.tabWeeks', icon: CalendarRange },
  { id: 'gio-hoc', labelKey: 'adminSettings.tabSchedule', icon: Clock },
] as const

const active = computed(() => SECTIONS.find((s) => s.id === route.query.muc) ?? SECTIONS[0])

function select(id: string) {
  router.replace({ query: { ...route.query, muc: id } })
}
</script>

<template>
  <div class="space-y-5">
    <div
      class="flex gap-6 overflow-x-auto border-b border-zinc-950/10 dark:border-white/10"
      role="tablist"
      :aria-label="t('adminSettings.tabsLabel')"
    >
      <button
        v-for="s in SECTIONS"
        :id="`settings-tab-${s.id}`"
        :key="s.id"
        type="button"
        role="tab"
        :aria-selected="active.id === s.id"
        :aria-controls="`settings-panel-${s.id}`"
        class="-mb-px flex items-center gap-2 border-b-2 px-0.5 pb-3 text-sm font-semibold whitespace-nowrap transition"
        :class="
          active.id === s.id
            ? 'border-brand-600 text-zinc-900 dark:border-brand-400 dark:text-white'
            : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-100'
        "
        @click="select(s.id)"
      >
        <component :is="s.icon" class="size-4" aria-hidden="true" />
        {{ t(s.labelKey) }}
      </button>
    </div>

    <section
      :id="`settings-panel-${active.id}`"
      role="tabpanel"
      :aria-labelledby="`settings-tab-${active.id}`"
    >
      <KeepAlive>
        <WeeksPanel v-if="active.id === 'mo-dong-tuan'" @edit-schedule="select('gio-hoc')" />
        <ClassScheduleForm v-else />
      </KeepAlive>
    </section>
  </div>
</template>
