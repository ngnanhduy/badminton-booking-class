<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowUpDown, LockKeyhole, RefreshCw, Search, UsersRound } from '@lucide/vue'

import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { formatDate, slotShort } from '@/i18n/format'

import { api, errorMessage } from '@/services/api'
import type { Member } from '@/types/booking'
import { parseSlot } from '@/utils/slots'

const { t } = useI18n()

const members = ref<Member[]>([])
const weekLabel = ref('')
const loading = ref(false)
const error = ref('')
const query = ref('')
const onlyThisWeek = ref(false)

type SortKey = 'name' | 'weeks' | 'attendance' | 'recent'
const sortBy = ref<SortKey>('name')
const SORTS: SortKey[] = ['name', 'weeks', 'attendance', 'recent']
const sortOptions = computed(() =>
  SORTS.map((key) => ({ value: key, label: t(`members.sort.${key}`) })),
)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.listMembers()
    members.value = data.members
    weekLabel.value = data.weekLabel
  } catch (e) {
    error.value = errorMessage(e, t('members.loadFailed'))
  } finally {
    loading.value = false
  }
}
onMounted(load)

/** Share of marked sessions attended, or null when nothing was marked yet. */
const rate = (m: Pick<Member, 'attended' | 'absent'>) =>
  m.attended + m.absent ? m.attended / (m.attended + m.absent) : null

const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`)

const stats = computed(() => {
  const all = members.value
  const attended = all.reduce((n, m) => n + m.attended, 0)
  const absent = all.reduce((n, m) => n + m.absent, 0)
  return [
    { label: t('members.statTotal'), value: String(all.length) },
    { label: t('members.statThisWeek'), value: String(all.filter((m) => m.thisWeek).length) },
    { label: t('members.statAttendance'), value: percent(rate({ attended, absent })) },
  ]
})

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = members.value.filter(
    (m) => (!q || m.zaloName.toLowerCase().includes(q)) && (!onlyThisWeek.value || m.thisWeek),
  )
  const byName = (a: Member, b: Member) => a.zaloName.localeCompare(b.zaloName, 'vi')
  const compare: Record<SortKey, (a: Member, b: Member) => number> = {
    name: byName,
    weeks: (a, b) => b.weeks - a.weeks || b.sessions - a.sessions || byName(a, b),
    attendance: (a, b) => (rate(b) ?? -1) - (rate(a) ?? -1) || byName(a, b),
    recent: (a, b) => b.lastBookedAt.localeCompare(a.lastBookedAt),
  }
  return [...list].sort(compare[sortBy.value])
})

const slotLabel = (value: string) => {
  const slot = parseSlot(value)
  return slot.dayIndex < 7 ? slotShort(slot) : value
}

const rateClass = (value: number | null) => {
  if (value === null) return 'bg-zinc-300 dark:bg-zinc-700'
  if (value >= 0.8) return 'bg-brand-500'
  if (value >= 0.5) return 'bg-amber-500'
  return 'bg-rose-500'
}
</script>

<template>
  <div class="space-y-4">
    <dl class="grid grid-cols-3 gap-2 sm:gap-3">
      <div
        v-for="s in stats"
        :key="s.label"
        class="rounded-2xl bg-white/90 px-4 py-3 ring-1 ring-zinc-950/[0.06] dark:bg-zinc-900/70 dark:ring-white/10"
      >
        <dt class="text-xs text-zinc-500 dark:text-zinc-400">{{ s.label }}</dt>
        <dd class="mt-0.5 text-2xl font-bold tracking-tight tabular-nums">{{ s.value }}</dd>
      </div>
    </dl>

    <BaseCard :padded="false" solid>
      <div class="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex w-full flex-col gap-2 sm:flex-row lg:max-w-lg">
          <div class="relative flex-1">
            <Search
              class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <input
              v-model="query"
              type="search"
              :placeholder="t('members.search')"
              :aria-label="t('members.search')"
              class="block h-10 w-full rounded-xl bg-white pr-3 pl-9 text-sm ring-1 ring-zinc-950/10 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-brand-500 dark:bg-zinc-950/40 dark:ring-white/10"
            />
          </div>
          <label class="sr-only" for="members-sort">{{ t('members.sortLabel') }}</label>
          <BaseSelect
            id="members-sort"
            v-model="sortBy"
            :options="sortOptions"
            :icon="ArrowUpDown"
            size="sm"
            class="sm:w-56"
          />
        </div>
        <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
          <BaseSwitch v-model="onlyThisWeek" :label="t('members.onlyThisWeek')" />
          <BaseButton
            variant="secondary"
            size="sm"
            :icon="RefreshCw"
            :loading="loading"
            @click="load"
          >
            {{ t('common.refresh') }}
          </BaseButton>
        </div>
      </div>

      <BaseAlert v-if="error" tone="danger" class="mx-4 mb-4 sm:mx-5">{{ error }}</BaseAlert>

      <div
        v-if="loading && !members.length"
        class="space-y-2 border-t border-zinc-950/5 p-4 dark:border-white/[0.07]"
        aria-busy="true"
      >
        <div
          v-for="n in 5"
          :key="n"
          class="h-14 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5"
        />
      </div>

      <EmptyState
        v-else-if="!visible.length"
        class="border-t border-zinc-950/5 dark:border-white/[0.07]"
        :icon="UsersRound"
        :title="members.length ? t('adminBookings.noResults') : t('members.empty')"
        :description="members.length ? t('adminBookings.noResultsHint') : t('members.emptyHint')"
      />

      <template v-else>
        <div
          class="hidden border-t border-zinc-950/5 px-5 py-2 text-xs font-medium text-zinc-500 md:grid md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_5rem_9rem_7rem] md:gap-4 dark:border-white/[0.07] dark:text-zinc-400"
          aria-hidden="true"
        >
          <span>{{ t('common.zaloName') }}</span>
          <span>{{ t('members.colThisWeek', { week: weekLabel }) }}</span>
          <span class="text-right">{{ t('members.colWeeks') }}</span>
          <span>{{ t('members.colAttendance') }}</span>
          <span class="text-right">{{ t('members.colLast') }}</span>
        </div>
        <ul
          class="divide-y divide-zinc-950/5 border-t border-zinc-950/5 dark:divide-white/[0.07] dark:border-white/[0.07]"
        >
          <li
            v-for="m in visible"
            :key="`${m.zaloName}|${m.firstBookedAt}`"
            class="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_5rem_9rem_7rem] md:items-center"
          >
            <div class="col-span-2 min-w-0 md:col-span-1">
              <p class="truncate font-semibold">{{ m.zaloName }}</p>
              <p class="text-xs text-zinc-500 dark:text-zinc-400">
                {{ t('members.since', { date: formatDate(m.firstBookedAt) }) }}
              </p>
            </div>

            <div class="col-span-2 min-w-0 md:col-span-1">
              <ul v-if="m.thisWeek" class="flex flex-wrap gap-1.5">
                <li
                  v-for="slot in m.thisWeek.slots"
                  :key="slot"
                  class="rounded-lg bg-brand-50 px-2 py-1 text-xs font-medium text-brand-800 ring-1 ring-brand-600/10 dark:bg-brand-400/10 dark:text-brand-200 dark:ring-brand-400/15"
                >
                  {{ slotLabel(slot) }}
                </li>
              </ul>
              <span v-else class="text-xs text-zinc-400 dark:text-zinc-500">
                {{ t('members.notThisWeek', { week: m.lastWeekLabel }) }}
              </span>
            </div>

            <p class="text-sm tabular-nums md:text-right">
              <span class="text-xs text-zinc-500 md:hidden dark:text-zinc-400">
                {{ t('members.colWeeks') }}:
              </span>
              <span class="font-semibold">{{ m.weeks }}</span>
              <span class="text-xs text-zinc-500 dark:text-zinc-400">
                · {{ t('members.sessions', { n: m.sessions }, m.sessions) }}
              </span>
            </p>

            <div class="flex items-center gap-2">
              <span
                class="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10"
                aria-hidden="true"
              >
                <span
                  class="block h-full rounded-full"
                  :class="rateClass(rate(m))"
                  :style="{ width: `${Math.round((rate(m) ?? 0) * 100)}%` }"
                />
              </span>
              <span class="text-sm tabular-nums">
                <span class="font-semibold">{{ percent(rate(m)) }}</span>
                <span v-if="m.attended + m.absent" class="text-xs text-zinc-500 dark:text-zinc-400">
                  ({{ m.attended }}/{{ m.attended + m.absent }})
                </span>
              </span>
            </div>

            <p
              class="col-span-2 text-xs text-zinc-500 md:col-span-1 md:text-right dark:text-zinc-400"
            >
              <span class="md:hidden">{{ t('members.colLast') }}: </span>
              {{ formatDate(m.lastBookedAt) }}
            </p>
          </li>
        </ul>
      </template>
    </BaseCard>

    <p class="flex items-start gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
      <LockKeyhole class="mt-px size-3.5 shrink-0" aria-hidden="true" />
      {{ t('members.privacyNote', { n: members.length }, members.length) }}
    </p>
  </div>
</template>
