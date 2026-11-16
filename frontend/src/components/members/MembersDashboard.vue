<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowUpDown,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  FileSpreadsheet,
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
import { dayName, slotShort, startTime, timeRange } from '@/i18n/format'

import { adminApi } from '@/services/admin'
import { api, ApiError, errorMessage } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import type { Member, MemberWeek, Slot } from '@/types/booking'
import type { SelectOption } from '@/types/ui'
import { attendanceRate, formatPercent, membersFileName, membersSheet } from '@/utils/members'
import { mergeSlots } from '@/utils/slots'
import { dayMonth, dayTiming, weekDayDate, type DayTiming } from '@/utils/week'
import { downloadXlsx } from '@/utils/xlsx'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
// Only shows the admin buttons (phone/email, Excel export); the list itself is public and the
// server checks the role. (The header's user menu loads the session.)
const auth = useAuthStore()

const members = ref<Member[]>([])
const weeks = ref<MemberWeek[]>([])
/** The week the loaded list refers to. */
const weekLabel = ref('')
const weekAttendance = ref({ present: 0, absent: 0 })
const loading = ref(false)
const error = ref('')
const query = ref('')
/**
 * Admins only: load the list from the admin API, with each student's phone/email (every load
 * is audited). Off on each visit, and turned off when the visitor is no longer an admin.
 */
const showContacts = ref(false)

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

function withoutContact(member: Member): Member {
  const copy = { ...member }
  delete copy.contact
  return copy
}

let latestRequest = 0
async function load() {
  const request = ++latestRequest
  const withContacts = showContacts.value
  loading.value = true
  error.value = ''
  try {
    const data = withContacts
      ? await adminApi.listMembers(selectedWeek.value)
      : await api.listMembers(selectedWeek.value)
    if (request !== latestRequest) return // a newer week was picked meanwhile
    // Hidden again (or signed out) while this was loading: don't keep them.
    members.value = showContacts.value ? data.members : data.members.map(withoutContact)
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
    // E.g. the session expired: go back to the public list on the next load.
    if (withContacts) showContacts.value = false
    error.value = errorMessage(e, t('members.loadFailed'))
  } finally {
    if (request === latestRequest) loading.value = false
  }
}
watch(selectedWeek, load, { immediate: true })

function toggleContacts() {
  showContacts.value = !showContacts.value
  load()
}

// Hiding them also forgets them, so nothing stays in the page's memory.
watch(showContacts, (shown) => {
  if (!shown) members.value = members.value.map(withoutContact)
})
// Signed out, or another account without the admin role: hide them.
watch(
  () => auth.isAdmin,
  (admin) => {
    if (!admin) showContacts.value = false
  },
)

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

// ── The week: one row per student, one column per day someone booked ─────────────────────

interface BookedRow {
  member: Member
  /** Their slots that week by weekday (0 = Monday), earliest first. */
  byDay: Map<number, Slot[]>
  /** All their slots, Mon → Sun. */
  slots: Slot[]
}
interface WeekDay {
  dayIndex: number
  /** Any slot of the day, for its name. */
  first: Slot
  /** "17/11", or "" when the week has no readable date. */
  date: string
  timing: DayTiming | null
  /** Every slot booked that day, earliest first. */
  slots: Slot[]
  /** Students coming that day (once each, even with two slots). */
  count: number
}

/** The students who booked the loaded week, each with their week by day. */
const booked = computed<BookedRow[]>(() =>
  members.value.flatMap((member) => {
    if (!member.week) return []
    // mergeSlots drops duplicates and sorts, so each day reads earliest first.
    const slots = mergeSlots(member.week.slots)
    const byDay = new Map<number, Slot[]>()
    for (const slot of slots) {
      const list = byDay.get(slot.dayIndex)
      if (list) list.push(slot)
      else byDay.set(slot.dayIndex, [slot])
    }
    return [{ member, byDay, slots }]
  }),
)

/** The columns: every day someone booked in the loaded week, Mon → Sun. */
const days = computed<WeekDay[]>(() => {
  const now = new Date()
  const byDay = new Map<number, { slots: Map<string, Slot>; count: number }>()
  for (const row of booked.value) {
    for (const [dayIndex, slots] of row.byDay) {
      let day = byDay.get(dayIndex)
      if (!day) byDay.set(dayIndex, (day = { slots: new Map(), count: 0 }))
      day.count++
      for (const slot of slots) day.slots.set(slot.value, slot)
    }
  }
  return [...byDay]
    .sort(([a], [b]) => a - b)
    .map(([dayIndex, day]) => {
      const slots = [...day.slots.values()].sort((a, b) => (a.start ?? 99) - (b.start ?? 99))
      const date = weekDayDate(shownWeek.value, dayIndex, now)
      return {
        dayIndex,
        first: slots[0]!,
        date: date ? dayMonth(date) : '',
        timing: date ? dayTiming(date, now) : null,
        slots,
        count: day.count,
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
/** By name, or by phone/email when shown ("0912 345" finds 0912345678). */
function matches(m: Member) {
  const q = search.value
  if (!q || m.zaloName.toLocaleLowerCase('vi').includes(q)) return true
  if (!m.contact) return false
  const compact = q.replace(/[\s.()-]/g, '')
  return m.contact.includes(q) || (!!compact && m.contact.includes(compact))
}
const searchLabel = computed(() =>
  showContacts.value ? t('members.searchWithContact') : t('members.search'),
)

const byName = (a: Member, b: Member) => a.zaloName.localeCompare(b.zaloName, 'vi')
const compare = (a: Member, b: Member) =>
  sortBy.value === 'attendance'
    ? (attendanceRate(b) ?? -1) - (attendanceRate(a) ?? -1) || byName(a, b)
    : byName(a, b)

/** Everyone coming that week, or on the chosen day; every day's column stays shown. */
const visibleBooked = computed(() => {
  const day = dayFilter.value
  if (day === 'none') return []
  return booked.value
    .filter((r) => (day === 'all' || r.byDay.has(day)) && matches(r.member))
    .sort((a, b) => compare(a.member, b.member))
})

const visibleNotBooked = computed(() =>
  dayFilter.value === 'all' || dayFilter.value === 'none'
    ? notBooked.value.filter(matches).sort(compare)
    : [],
)

/** Folding only makes sense under the week's days; picked, searched or alone, it's open. */
const notBookedFoldable = computed(
  () => dayFilter.value === 'all' && !search.value && visibleBooked.value.length > 0,
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

/** The loaded week as a spreadsheet: everyone, whatever the search or day filter, in the chosen order. */
function exportExcel() {
  downloadXlsx(
    membersSheet(members.value, shownWeek.value, compare),
    membersFileName(weekLabel.value),
  )
}

const stepButton =
  'grid size-10 shrink-0 place-items-center rounded-xl bg-white text-zinc-600 ring-1 ring-zinc-950/10 transition hover:text-zinc-900 hover:ring-zinc-950/20 disabled:pointer-events-none disabled:opacity-40 dark:bg-zinc-950/40 dark:text-zinc-300 dark:ring-white/10 dark:hover:text-white dark:hover:ring-white/20'

const memberKey = (m: Member) => `${m.zaloName}|${m.firstBookedAt}`

// ── Week strip ──────────────────────────────────────────────────────────────────────────

/** Width of a day cell (rem) from lg, and the gap between cells (`gap-1.5`). */
const DAY_REM = 5
const GAP_REM = 0.375

/**
 * Columns of the header and of every MemberRow from lg: name, the week's days, attendance.
 * The days take just the room their cells need (12rem at least, for the "last week" lines of
 * students who didn't book), so attendance sits right after them rather than across the card.
 */
const gridStyle = computed(() => {
  const n = days.value.length
  const strip = Math.max(12, n * DAY_REM + Math.max(n - 1, 0) * GAP_REM)
  return { '--member-cols': `minmax(0,15rem) minmax(0,${strip}rem) minmax(9rem,1fr)` }
})

/**
 * One day of the strip. From lg the header has the same cells, so the days line up as columns;
 * below lg there is no header, and each cell names its day instead.
 */
const dayCell = 'w-9 shrink-0 sm:w-11 lg:w-auto lg:max-w-20 lg:min-w-0 lg:flex-1'

/** With a day chip picked, the other days fade so its column stands out. */
const dimmed = (day: WeekDay) =>
  typeof dayFilter.value === 'number' && day.dayIndex !== dayFilter.value

const slotsOn = (row: BookedRow, day: WeekDay) => row.byDay.get(day.dayIndex) ?? []
/** "T2 · 18h – 20h, T4 · 18h – 20h" */
const slotList = (slots: Slot[]) => slots.map(slotShort).join(', ')

function cellClass(row: BookedRow, day: WeekDay) {
  return [
    row.byDay.has(day.dayIndex)
      ? 'bg-brand-500/15 text-brand-800 ring-1 ring-brand-600/20 dark:bg-brand-400/15 dark:text-brand-200 dark:ring-brand-400/25'
      : 'text-zinc-400 ring-1 ring-zinc-950/[0.06] lg:ring-0 dark:text-zinc-500 dark:ring-white/[0.06]',
    dimmed(day) && 'opacity-40',
  ]
}
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
      <!-- Admins only (the server refuses everyone else). -->
      <div v-if="auth.isAdmin" class="ml-auto flex flex-wrap gap-2">
        <BaseButton
          variant="secondary"
          size="sm"
          :icon="showContacts ? EyeOff : Eye"
          :disabled="loading"
          :aria-pressed="showContacts"
          :title="t('members.contactsTitle')"
          @click="toggleContacts"
        >
          {{ showContacts ? t('members.hideContacts') : t('members.showContacts') }}
        </BaseButton>
        <BaseButton
          variant="secondary"
          size="sm"
          :icon="FileSpreadsheet"
          :disabled="loading || !members.length"
          :title="t('members.exportTitle')"
          @click="exportExcel"
        >
          {{ t('members.exportExcel') }}
        </BaseButton>
      </div>
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
              :placeholder="searchLabel"
              :aria-label="searchLabel"
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
        v-else-if="!visibleBooked.length && !visibleNotBooked.length"
        class="border-t border-zinc-950/5 dark:border-white/[0.07]"
        :icon="UsersRound"
        :title="members.length ? t('adminBookings.noResults') : t('members.empty')"
        :description="members.length ? t('adminBookings.noResultsHint') : t('members.emptyHint')"
      />

      <div
        v-else
        class="transition-opacity"
        :class="loading && 'opacity-60'"
        :style="gridStyle"
        :aria-busy="loading || undefined"
      >
        <!-- Column header (lg and up): name, one column per day, attendance. -->
        <div
          class="hidden items-end border-t border-zinc-950/5 px-5 py-2.5 text-[0.6875rem] font-semibold tracking-wider text-zinc-500 uppercase lg:grid lg:grid-cols-(--member-cols) lg:gap-x-4 dark:border-white/[0.07] dark:text-zinc-400"
          aria-hidden="true"
        >
          <span>{{ t('common.zaloName') }}</span>
          <span class="flex gap-1.5 font-normal tracking-normal normal-case">
            <template v-if="visibleBooked.length">
              <span
                v-for="day in days"
                :key="day.dayIndex"
                class="flex flex-col items-center text-center leading-tight transition-opacity"
                :class="[dayCell, dimmed(day) && 'opacity-40']"
              >
                <span
                  class="flex items-center gap-1 text-xs font-semibold"
                  :class="
                    day.timing === 'today'
                      ? 'text-brand-700 dark:text-brand-300'
                      : 'text-zinc-800 dark:text-zinc-100'
                  "
                >
                  <span v-if="day.timing === 'today'" class="size-1.5 rounded-full bg-brand-500" />
                  {{ dayName(day.first, 'short') }}
                </span>
                <span v-if="day.date" class="tabular-nums">{{ day.date }}</span>
                <span class="mt-0.5 tabular-nums">
                  {{
                    day.slots.length > 1
                      ? t('members.daySlots', { n: day.slots.length }, day.slots.length)
                      : timeRange(day.first)
                  }}
                </span>
              </span>
            </template>
          </span>
          <span>{{ t('members.colAttendance') }}</span>
        </div>

        <p
          v-if="!days.length && dayFilter === 'all' && !search"
          class="border-t border-zinc-950/5 px-4 py-4 text-sm text-zinc-500 sm:px-5 dark:border-white/[0.07] dark:text-zinc-400"
        >
          {{ t('members.noneBooked', { week: weekLabel }) }}
        </p>

        <!-- One row per student: their whole week at a glance, the same days in every row. -->
        <ul
          v-if="visibleBooked.length"
          class="divide-y divide-zinc-950/5 border-t border-zinc-950/5 dark:divide-white/[0.07] dark:border-white/[0.07]"
        >
          <MemberRow v-for="row in visibleBooked" :key="memberKey(row.member)" :member="row.member">
            <p class="sr-only">{{ t('members.bookedSlots', { slots: slotList(row.slots) }) }}</p>
            <div class="flex gap-1 sm:gap-1.5" aria-hidden="true">
              <span
                v-for="day in days"
                :key="day.dayIndex"
                class="flex min-h-9 flex-col items-center justify-center rounded-lg px-0.5 py-1 text-center text-[0.6875rem] leading-tight transition-opacity lg:h-7 lg:min-h-0 lg:rounded-md lg:py-0"
                :class="[dayCell, cellClass(row, day)]"
                :title="slotList(slotsOn(row, day)) || undefined"
              >
                <!-- Phones: the day's name, and the start time when booked. -->
                <span class="font-semibold lg:hidden">{{ dayName(day.first, 'short') }}</span>
                <template v-if="slotsOn(row, day).length">
                  <!-- From lg the header gives the time, unless the day has several slots. -->
                  <span
                    class="max-w-full truncate tabular-nums"
                    :class="day.slots.length > 1 ? 'lg:font-semibold' : 'lg:hidden'"
                  >
                    {{ slotsOn(row, day).map(startTime).join(', ') }}
                  </span>
                  <Check
                    v-if="day.slots.length === 1"
                    class="hidden size-3.5 lg:block"
                    :stroke-width="3"
                  />
                </template>
                <span
                  v-else
                  class="hidden size-1 rounded-full bg-zinc-300 lg:block dark:bg-zinc-600"
                />
              </span>
            </div>
          </MemberRow>
        </ul>

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
      {{
        t(
          auth.isAdmin ? 'members.privacyNoteAdmin' : 'members.privacyNote',
          { n: members.length },
          members.length,
        )
      }}
    </p>
  </div>
</template>
