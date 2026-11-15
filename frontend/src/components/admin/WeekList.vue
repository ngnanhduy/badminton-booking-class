<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMediaQuery } from '@vueuse/core'
import { CalendarPlus, ChevronDown, History, RefreshCw } from '@lucide/vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useAdminWeeks } from '@/composables/useAdminWeeks'
import { formatWhen } from '@/i18n/format'
import type { WeekSummary } from '@/types/admin'

/** Every week, newest first: pick one to edit its settings, or start a new one. */
defineProps<{
  /** The create form is showing (no week is highlighted). */
  creating: boolean
}>()
const emit = defineEmits<{ create: []; select: [] }>()

const { t } = useI18n()
const { weeks, loading, load, selected, selectWeek } = useAdminWeeks()

/** Weeks shown before "Show more" (the selected week is always shown); fewer on phones. */
const wide = useMediaQuery('(min-width: 1024px)')
const expanded = ref(false)
const shown = computed(() => {
  const limit = wide.value ? 5 : 3
  return expanded.value
    ? weeks.value
    : weeks.value.filter((w, i) => i < limit || w.id === selected.value?.id)
})
const hiddenCount = computed(() => weeks.value.length - shown.value.length)

function select(week: WeekSummary) {
  selectWeek(week.weekLabel)
  emit('select')
}

const rate = (present: number, absent: number) =>
  present + absent ? Math.round((present / (present + absent)) * 100) : null

function statusBadge(w: WeekSummary) {
  if (w.status === 'open') return { text: t('adminWeeks.badgeOpen'), tone: 'open' as const }
  if (w.status === 'upcoming' && w.opensAt) {
    return {
      text: t('adminWeeks.badgeUpcoming', { date: formatWhen(w.opensAt) }),
      tone: 'soon' as const,
    }
  }
  if (w.open) return { text: t('adminWeeks.badgeEnded'), tone: 'muted' as const }
  return null
}

const BADGE = {
  open: 'bg-brand-50 text-brand-800 dark:bg-brand-400/10 dark:text-brand-200',
  soon: 'bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200',
  muted: 'bg-zinc-100 text-zinc-600 dark:bg-white/5 dark:text-zinc-400',
} as const
</script>

<template>
  <BaseCard :padded="false" solid>
    <div class="flex items-start justify-between gap-2 p-4 pb-3">
      <div>
        <h2 class="text-base font-semibold tracking-tight">{{ t('adminWeeks.historyTitle') }}</h2>
        <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {{ t('adminSettings.perWeekHint') }}
        </p>
      </div>
      <BaseButton
        variant="ghost"
        size="sm"
        :icon="RefreshCw"
        :loading="loading"
        :aria-label="t('common.refresh')"
        :title="t('common.refresh')"
        @click="load({ force: true })"
      />
    </div>

    <div class="px-4 pb-3">
      <BaseButton
        :variant="creating ? 'primary' : 'soft'"
        size="sm"
        block
        :icon="CalendarPlus"
        :aria-pressed="creating"
        @click="emit('create')"
      >
        {{ t('adminWeeks.newTitle') }}
      </BaseButton>
    </div>

    <div v-if="loading && !weeks.length" class="space-y-2 px-4 pb-4" aria-busy="true">
      <div
        v-for="n in 3"
        :key="n"
        class="h-14 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5"
      />
    </div>

    <EmptyState
      v-else-if="!weeks.length"
      class="border-t border-zinc-950/5 dark:border-white/[0.07]"
      :icon="History"
      :title="t('adminWeeks.historyEmpty')"
    />

    <template v-else>
      <ul class="space-y-1 px-2 pb-2">
        <li v-for="w in shown" :key="w.id">
          <button
            type="button"
            class="w-full rounded-xl px-3 py-2.5 text-left ring-1 transition"
            :class="
              !creating && w.id === selected?.id
                ? 'bg-brand-50 ring-brand-600/20 dark:bg-brand-400/10 dark:ring-brand-400/25'
                : 'ring-transparent hover:bg-zinc-950/[0.03] dark:hover:bg-white/5'
            "
            :aria-current="!creating && w.id === selected?.id ? 'true' : undefined"
            @click="select(w)"
          >
            <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span class="text-sm font-semibold tabular-nums">{{ w.weekLabel }}</span>
              <span
                v-if="statusBadge(w)"
                class="rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
                :class="BADGE[statusBadge(w)!.tone]"
              >
                {{ statusBadge(w)!.text }}
              </span>
              <span
                v-else-if="w.current"
                class="rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
                :class="BADGE.muted"
              >
                {{ t('adminWeeks.badgeCurrent') }}
              </span>
            </span>
            <span class="mt-0.5 block text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
              {{ t('adminWeeks.students', { n: w.bookings }, w.bookings) }} ·
              {{ t('adminWeeks.sessions', { n: w.sessions }, w.sessions) }}
              <template v-if="rate(w.present, w.absent) !== null">
                · {{ t('adminWeeks.attendance', { rate: rate(w.present, w.absent) }) }}
              </template>
            </span>
          </button>
        </li>
      </ul>
      <div
        v-if="hiddenCount || expanded"
        class="border-t border-zinc-950/5 px-2 py-1.5 dark:border-white/[0.07]"
      >
        <button
          type="button"
          class="flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-950/[0.03] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{
            expanded
              ? t('adminWeeks.showLess')
              : t('adminWeeks.showMore', { n: hiddenCount }, hiddenCount)
          }}
          <ChevronDown
            class="size-3.5 transition"
            :class="expanded && 'rotate-180'"
            aria-hidden="true"
          />
        </button>
      </div>
    </template>
  </BaseCard>
</template>
