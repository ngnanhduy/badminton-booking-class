<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowUpDown,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  LockKeyhole,
  RefreshCw,
  Search,
  Undo2,
  UsersRound,
} from '@lucide/vue'

import MemberRow from '@/components/members/MemberRow.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { dayName, slotShort, timeRange } from '@/i18n/format'

import { api, ApiError, errorMessage } from '@/services/api'
import type { Member, MemberWeek, Slot } from '@/types/booking'
import type { SelectOption } from '@/types/ui'
import { attendanceRate, formatPercent } from '@/utils/members'
import { mergeSlots } from '@/utils/slots'
import { dayMonth, dayTiming, weekDayDate, type DayTiming } from '@/utils/week'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const members = ref<Member[]>([])
const weeks = ref<MemberWeek[]>([])
/** The week the loaded list refers to. */
const weekLabel = ref('')
const weekAttendance = ref({ present: 0, absent: 0 })
const loading = ref(false)
const error = ref('')
const query = ref('')

type SortKey = 'name' | 'attendance'
const sortBy = ref<SortKey>('name')
const SORTS: SortKey[] = ['name', 'attendance']
const sortOptions = computed(() =>
  SORTS.map((key) => ({ value: key, label: t(`members.sort.${key}`) })),
)

/** Day chip: a weekday index (0 = Monday), every day, or the students who didn't book. */
type DayFilter = 'all' | 'none' | number
const dayFilter = ref<DayFilter>('all')
/** The "didn't book" list starts folded, so the people coming this week come first. */
const notBookedExpanded = ref(false)

// ── Week ────────────────────────────────────────────────────────────────────────────────

/** Week chosen in the URL (`?week=<label>`, as on the admin pages); undefined = current. */
const selectedWeek = computed(() => {
  const week = route.query.week
  return typeof week === 'string' && week ? week : undefined
})

const currentWeek = computed(() => weeks.value.find((w) => w.current))
const isCurrent = computed(
  () => !currentWeek.value || weekLabel.value === currentWeek.value.weekLabel,
)

function selectWeek(week: string | undefined) {
  const current = !week || week === currentWeek.value?.weekLabel
  router.replace({ query: { ...route.query, week: current ? undefined : week } })
}

/** The current week is the empty value, so the URL stays clean by default. */
const weekOptions = computed<SelectOption[]>(() =>
  weeks.value.map((w) => ({
    value: w.current ? '' : w.weekLabel,
    label: t('common.week', { week: w.weekLabel }),
    hint: t('members.weekStudents', { n: w.bookings }, w.bookings),
    ...(w.status === 'open'
      ? { badge: t('adminWeeks.badgeOpen'), badgeTone: 'brand' as const }
      : w.current
        ? { badge: t('members.currentWeek'), badgeTone: 'muted' as const }
        : {}),
  })),
)
const weekValue = computed({
  get: () => (isCurrent.value ? '' : weekLabel.value),
  set: (week: string) => selectWeek(week || undefined),
})

// Weeks are newest first: "older" is further down the list.
const weekIndex = computed(() => weeks.value.findIndex((w) => w.weekLabel === weekLabel.value))
const olderWeek = computed(() =>
  weekIndex.value >= 0 ? weeks.value[weekIndex.value + 1] : undefined,
)
const newerWeek = computed(() =>
  weekIndex.value > 0 ? weeks.value[weekIndex.value - 1] : undefined,
)

/** The loaded week, for the dates of its days (its label alone when it isn't listed). */
const shownWeek = computed(
  () =>
    weeks.value.find((w) => w.weekLabel === weekLabel.value) ?? {
      weekLabel: weekLabel.value,
      startDate: null,
    },
)

// ── Data ────────────────────────────────────────────────────────────────────────────────

let latestRequest = 0
async function load() {
  const request = ++latestRequest
  loading.value = true
  error.value = ''
  try {
    const data = await api.listMembers(selectedWeek.value)
    if (request !== latestRequest) return // a newer week was picked meanwhile
    members.value = data.members
    weeks.value = data.weeks
    weekLabel.value = data.weekLabel
    weekAttendance.value = data.attendance
  } catch (e) {
    if (request !== latestRequest) return
    // A week typed or bookmarked in the URL that no longer exists: show the current one.
    if (selectedWeek.value && e instanceof ApiError && e.code === 'WEEK_NOT_FOUND') {
      selectWeek(undefined)
      return
    }
    error.value = errorMessage(e, t('members.loadFailed'))
  } finally {
    if (request === latestRequest) loading.value = false
  }
}
watch(selectedWeek, load, { immediate: true })

const bookedCount = computed(() => members.value.filter((m) => m.week).length)

const stats = computed(() => {
  const sessions = members.value.reduce((n, m) => n + (m.week?.count ?? 0), 0)
  const { present, absent } = weekAttendance.value
  const marked = present + absent
  return [
    {
      key: 'total',
      label: t('members.statTotal'),
      value: String(members.value.length),
      hint: t('members.statTotalHint'),
    },
    {
      key: 'booked',
      label: t('members.statBooked'),
      value: String(bookedCount.value),
      hint: t('members.sessions', { n: sessions }, sessions),
    },
    {
      key: 'attendance',
      label: t('members.statAttendance'),
      value: formatPercent(marked ? present / marked : null),
      hint: marked
        ? t('members.statAttendanceHint', { present, total: marked })
        : t('members.notMarked'),
    },
  ]
})

// ── Grouping: day → time slot → students ─────────────────────────────────────────────────

interface Attendee {
  member: Member
  /** Their other sessions that week, Mon → Sun. */
  others: Slot[]
}
interface SlotGroup {
  slot: Slot
  attendees: Attendee[]
}
interface DayGroup {
  dayIndex: number
  /** Any slot of the day, for its name. */
  first: Slot
  /** "17/11", or "" when the week has no readable date. */
  date: string
  timing: DayTiming | null
  slots: SlotGroup[]
  /** Students coming that day (once each, even with two slots). */
  count: number
}

/** Every day someone booked in the loaded week, Mon → Sun, each slot earliest first. */
const days = computed<DayGroup[]>(() => {
  const now = new Date()
  const byDay = new Map<number, Map<string, SlotGroup>>()
  for (const member of members.value) {
    // mergeSlots drops duplicates and sorts, so `others` reads in week order.
    const booked = mergeSlots(member.week?.slots ?? [])
    for (const slot of booked) {
      let day = byDay.get(slot.dayIndex)
      if (!day) byDay.set(slot.dayIndex, (day = new Map()))
      let group = day.get(slot.value)
      if (!group) day.set(slot.value, (group = { slot, attendees: [] }))
      group.attendees.push({ member, others: booked.filter((s) => s.value !== slot.value) })
    }
  }
  return [...byDay]
    .sort(([a], [b]) => a - b)
    .map(([dayIndex, groups]) => {
      const slots = [...groups.values()].sort((a, b) => (a.slot.start ?? 99) - (b.slot.start ?? 99))
      const date = weekDayDate(shownWeek.value, dayIndex, now)
      return {
        dayIndex,
        first: slots[0]!.slot,
        date: date ? dayMonth(date) : '',
        timing: date ? dayTiming(date, now) : null,
        slots,
        count: new Set(slots.flatMap((s) => s.attendees.map((a) => a.member))).size,
      }
    })
})

const notBooked = computed(() => members.value.filter((m) => !m.week))

// A day that isn't in the newly loaded week: go back to every day.
watch([days, notBooked], () => {
  const day = dayFilter.value
  if (
    day === 'none'
      ? !notBooked.value.length
      : day !== 'all' && !days.value.some((d) => d.dayIndex === day)
  )
    dayFilter.value = 'all'
})

const search = computed(() => query.value.trim().toLocaleLowerCase('vi'))
const matches = (m: Member) =>
  !search.value || m.zaloName.toLocaleLowerCase('vi').includes(search.value)

const byName = (a: Member, b: Member) => a.zaloName.localeCompare(b.zaloName, 'vi')
const compare = (a: Member, b: Member) =>
  sortBy.value === 'attendance'
    ? (attendanceRate(b) ?? -1) - (attendanceRate(a) ?? -1) || byName(a, b)
    : byName(a, b)

const visibleDays = computed(() => {
  if (dayFilter.value === 'none') return []
  return days.value
    .filter((d) => dayFilter.value === 'all' || d.dayIndex === dayFilter.value)
    .map((d) => ({
      ...d,
      slots: d.slots
        .map((s) => ({
          ...s,
          attendees: s.attendees
            .filter((a) => matches(a.member))
            .sort((a, b) => compare(a.member, b.member)),
        }))
        .filter((s) => s.attendees.length),
    }))
    .filter((d) => d.slots.length)
})

const visibleNotBooked = computed(() =>
  dayFilter.value === 'all' || dayFilter.value === 'none'
    ? notBooked.value.filter(matches).sort(compare)
    : [],
)

/** Folding only makes sense under the week's days; picked, searched or alone, it's open. */
const notBookedFoldable = computed(
  () => dayFilter.value === 'all' && !search.value && visibleDays.value.length > 0,
)
const notBookedOpen = computed(() => !notBookedFoldable.value || notBookedExpanded.value)

const chips = computed(() => [
  {
    value: 'all' as DayFilter,
    label: t('members.filter.all'),
    date: '',
    count: null,
    today: false,
  },
  ...days.value.map((d) => ({
    value: d.dayIndex as DayFilter,
    label: dayName(d.first, 'short'),
    date: d.date,
    count: d.count,
    today: d.timing === 'today',
  })),
  ...(notBooked.value.length
    ? [
        {
          value: 'none' as DayFilter,
          label: t('members.filter.notBooked'),
          date: '',
          count: notBooked.value.length,
          today: false,
        },
      ]
    : []),
])

const stepButton =
  'grid size-10 shrink-0 place-items-center rounded-xl bg-white text-zinc-600 ring-1 ring-zinc-950/10 transition hover:text-zinc-900 hover:ring-zinc-950/20 disabled:pointer-events-none disabled:opacity-40 dark:bg-zinc-950/40 dark:text-zinc-300 dark:ring-white/10 dark:hover:text-white dark:hover:ring-white/20'

/** Same columns as MemberRow. */
const columns = 'md:grid md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_10rem] md:gap-x-4'
const memberKey = (m: Member) => `${m.zaloName}|${m.firstBookedAt}`
</script>

<template>
  <div class="space-y-4">
    <!-- Week: dropdown for any week, arrows to step through them. -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div class="flex w-full items-center gap-1.5 sm:w-auto">
        <button
          type="button"
          :class="stepButton"
          :disabled="!olderWeek"
          :aria-label="t('members.olderWeek')"
          :title="t('members.olderWeek')"
          @click="olderWeek && selectWeek(olderWeek.weekLabel)"
        >
          <ChevronLeft class="size-4" aria-hidden="true" />
        </button>
        <BaseSelect
          v-model="weekValue"
          :options="weekOptions"
          :icon="CalendarRange"
          :aria-label="t('members.weekPicker')"
          :placeholder="t('members.currentWeek')"
          size="sm"
          class="min-w-0 flex-1 sm:w-96 sm:flex-none"
        />
        <button
          type="button"
          :class="stepButton"
          :disabled="!newerWeek"
          :aria-label="t('members.newerWeek')"
          :title="t('members.newerWeek')"
          @click="newerWeek && selectWeek(newerWeek.weekLabel)"
        >
          <ChevronRight class="size-4" aria-hidden="true" />
        </button>
      </div>
      <BaseButton
        v-if="!isCurrent"
        variant="ghost"
        size="sm"
        :icon="Undo2"
        @click="selectWeek(undefined)"
      >
        {{ t('members.backToCurrent') }}
      </BaseButton>
    </div>

    <dl class="grid grid-cols-3 gap-2 sm:gap-3">
      <div
        v-for="s in stats"
        :key="s.key"
        class="min-w-0 rounded-2xl bg-white/90 px-3 py-3 ring-1 ring-zinc-950/[0.06] sm:px-4 dark:bg-zinc-900/70 dark:ring-white/10"
      >
        <dt class="text-xs text-zinc-500 dark:text-zinc-400">{{ s.label }}</dt>
        <dd class="mt-0.5 text-2xl font-bold tracking-tight tabular-nums">{{ s.value }}</dd>
        <dd class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{{ s.hint }}</dd>
      </div>
    </dl>

    <BaseCard :padded="false" solid>
      <div class="space-y-3 p-4 sm:p-5">
        <div class="flex flex-wrap gap-2 sm:flex-nowrap">
          <div class="relative w-full min-w-0 sm:flex-1">
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
            class="min-w-0 flex-1 sm:w-56 sm:flex-none"
          />
          <button
            type="button"
            :class="stepButton"
            :disabled="loading"
            :aria-label="t('common.refresh')"
            :title="t('common.refresh')"
            @click="load"
          >
            <RefreshCw class="size-4" :class="loading && 'animate-spin'" aria-hidden="true" />
          </button>
        </div>

        <!-- Day chips: who comes which day. Scrolls sideways on phones. -->
        <div
          v-if="members.length"
          role="group"
          :aria-label="t('members.filterLabel')"
          class="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 sm:-mx-5 sm:px-5"
        >
          <button
            v-for="chip in chips"
            :key="chip.value"
            type="button"
            :aria-pressed="dayFilter === chip.value"
            class="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-medium whitespace-nowrap ring-1 transition"
            :class="
              dayFilter === chip.value
                ? 'bg-zinc-900 text-white ring-zinc-900 dark:bg-white dark:text-zinc-900 dark:ring-white'
                : 'bg-white text-zinc-700 ring-zinc-950/10 hover:ring-zinc-950/25 dark:bg-zinc-950/40 dark:text-zinc-200 dark:ring-white/10 dark:hover:ring-white/25'
            "
            @click="dayFilter = chip.value"
          >
            <span
              v-if="chip.today"
              class="size-1.5 rounded-full bg-brand-500"
              :title="t('members.today')"
            />
            <span class="font-semibold">{{ chip.label }}</span>
            <span v-if="chip.date" class="tabular-nums opacity-70">{{ chip.date }}</span>
            <span
              v-if="chip.count !== null"
              class="rounded-full px-1.5 text-[0.6875rem] font-semibold tabular-nums"
              :class="
                dayFilter === chip.value
                  ? 'bg-white/20 dark:bg-zinc-900/15'
                  : 'bg-zinc-950/[0.06] dark:bg-white/10'
              "
            >
              {{ chip.count }}
            </span>
          </button>
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
        v-else-if="!visibleDays.length && !visibleNotBooked.length"
        class="border-t border-zinc-950/5 dark:border-white/[0.07]"
        :icon="UsersRound"
        :title="members.length ? t('adminBookings.noResults') : t('members.empty')"
        :description="members.length ? t('adminBookings.noResultsHint') : t('members.emptyHint')"
      />

      <div
        v-else
        class="transition-opacity"
        :class="loading && 'opacity-60'"
        :aria-busy="loading || undefined"
      >
        <div
          class="hidden border-t border-zinc-950/5 px-5 py-2.5 text-[0.6875rem] font-semibold tracking-wider text-zinc-500 uppercase dark:border-white/[0.07] dark:text-zinc-400"
          :class="columns"
          aria-hidden="true"
        >
          <span>{{ t('common.zaloName') }}</span>
          <span>{{ t('members.colOthers') }}</span>
          <span>{{ t('members.colAttendance') }}</span>
        </div>

        <p
          v-if="!days.length && dayFilter === 'all' && !search"
          class="border-t border-zinc-950/5 px-4 py-4 text-sm text-zinc-500 sm:px-5 dark:border-white/[0.07] dark:text-zinc-400"
        >
          {{ t('members.noneBooked', { week: weekLabel }) }}
        </p>

        <section
          v-for="day in visibleDays"
          :key="day.dayIndex"
          :aria-labelledby="`members-day-${day.dayIndex}`"
          :aria-current="day.timing === 'today' ? 'date' : undefined"
          class="border-t border-zinc-950/5 dark:border-white/[0.07]"
        >
          <header
            class="flex items-center gap-2 bg-zinc-50/80 px-4 py-2.5 sm:px-5 dark:bg-white/[0.025]"
          >
            <h3 :id="`members-day-${day.dayIndex}`" class="flex items-baseline gap-2">
              <span class="font-semibold">{{ dayName(day.first) }}</span>
              <span v-if="day.date" class="text-sm text-zinc-500 tabular-nums dark:text-zinc-400">
                {{ day.date }}
              </span>
            </h3>
            <span
              v-if="day.timing === 'today'"
              class="rounded-full bg-brand-600 px-2 py-0.5 text-[0.6875rem] font-semibold text-white dark:bg-brand-500 dark:text-brand-950"
            >
              {{ t('members.today') }}
            </span>
            <span class="ml-auto text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
              {{ t('members.weekStudents', { n: day.count }, day.count) }}
            </span>
          </header>

          <div v-for="group in day.slots" :key="group.slot.value">
            <p
              class="flex items-center gap-1.5 px-4 pt-3 pb-1 text-xs font-semibold text-zinc-700 sm:px-5 dark:text-zinc-200"
            >
              <Clock class="size-3.5 text-zinc-400" aria-hidden="true" />
              <span class="tabular-nums">{{ timeRange(group.slot) }}</span>
              <!-- With one slot that day, the day's own count already says it. -->
              <span
                v-if="day.slots.length > 1"
                class="font-normal text-zinc-500 dark:text-zinc-400"
              >
                ·
                {{
                  t('members.weekStudents', { n: group.attendees.length }, group.attendees.length)
                }}
              </span>
            </p>
            <ul class="divide-y divide-zinc-950/5 dark:divide-white/[0.07]">
              <MemberRow v-for="a in group.attendees" :key="memberKey(a.member)" :member="a.member">
                <template v-if="a.others.length" #default>
                  <p class="flex flex-wrap items-center gap-1 text-xs">
                    <span class="mr-0.5 text-zinc-500 md:hidden dark:text-zinc-400">
                      {{ t('members.alsoOn') }}
                    </span>
                    <span
                      v-for="s in a.others"
                      :key="s.value"
                      class="rounded-md bg-zinc-100 px-1.5 py-0.5 font-medium whitespace-nowrap text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300"
                    >
                      {{ slotShort(s) }}
                    </span>
                  </p>
                </template>
              </MemberRow>
            </ul>
          </div>
        </section>

        <section
          v-if="visibleNotBooked.length"
          aria-labelledby="members-not-booked"
          class="border-t border-zinc-950/5 dark:border-white/[0.07]"
        >
          <h3 id="members-not-booked">
            <component
              :is="notBookedFoldable ? 'button' : 'div'"
              :type="notBookedFoldable ? 'button' : undefined"
              :aria-expanded="notBookedFoldable ? notBookedOpen : undefined"
              :aria-controls="notBookedFoldable ? 'members-not-booked-list' : undefined"
              class="flex w-full items-center gap-2 bg-zinc-50/80 px-4 py-2.5 text-left sm:px-5 dark:bg-white/[0.025]"
              :class="
                notBookedFoldable && 'transition hover:bg-zinc-100/80 dark:hover:bg-white/[0.04]'
              "
              @click="notBookedFoldable && (notBookedExpanded = !notBookedExpanded)"
            >
              <span class="font-semibold text-zinc-600 dark:text-zinc-300">
                {{ t('members.filter.notBooked') }}
              </span>
              <span
                class="ml-auto text-xs whitespace-nowrap text-zinc-500 tabular-nums dark:text-zinc-400"
              >
                {{
                  t('members.weekStudents', { n: visibleNotBooked.length }, visibleNotBooked.length)
                }}
              </span>
              <ChevronDown
                v-if="notBookedFoldable"
                class="size-4 shrink-0 text-zinc-400 transition-transform"
                :class="notBookedOpen && 'rotate-180'"
                aria-hidden="true"
              />
            </component>
          </h3>
          <ul
            v-show="notBookedOpen"
            id="members-not-booked-list"
            class="divide-y divide-zinc-950/5 dark:divide-white/[0.07]"
          >
            <MemberRow v-for="m in visibleNotBooked" :key="memberKey(m)" :member="m">
              <p class="text-xs text-zinc-500 dark:text-zinc-400">
                {{ t('members.lastWeek', { week: m.lastWeekLabel }) }}
              </p>
            </MemberRow>
          </ul>
        </section>
      </div>
    </BaseCard>

    <p class="flex items-start gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
      <LockKeyhole class="mt-px size-3.5 shrink-0" aria-hidden="true" />
      {{ t('members.privacyNote', { n: members.length }, members.length) }}
    </p>
  </div>
</template>
