<script setup lang="ts">
import { computed, onActivated, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  CalendarPlus,
  ClipboardCheck,
  ClipboardList,
  History,
  Lock,
  LockOpen,
  RefreshCw,
  Settings2,
} from '@lucide/vue'

import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useAdminWeeks } from '@/composables/useAdminWeeks'
import { formatWhen } from '@/i18n/format'
import { adminApi } from '@/services/admin'
import { errorMessage } from '@/services/api'
import { useScheduleStore } from '@/stores/schedule'
import type { WeekSummary } from '@/types/admin'
import { fromLocalInput, nextWeekStart, weekLabelFromStart } from '@/utils/week'

const { t } = useI18n()
const schedule = useScheduleStore()
const { weeks, loading, load, openWeek, goTo } = useAdminWeeks()

onActivated(() => load({ force: true }))

/** The week that stops another one from opening (a passed closing time doesn't count). */
const blockingWeek = computed(() =>
  openWeek.value && openWeek.value.status !== 'closed' ? openWeek.value : undefined,
)

// --- New week -------------------------------------------------------------------------

const form = reactive({
  startDate: '',
  weekLabel: '',
  open: false,
  opensAt: '',
  closesAt: '',
})
/** Once the admin types a label, changing the date no longer overwrites it. */
const labelEdited = ref(false)
/** Week whose slots, rules and capacity the new week starts with. */
const copyFromId = ref('')
const creating = ref(false)
const createError = ref('')
const created = ref<string | null>(null)

function resetForm() {
  form.startDate = nextWeekStart(weeks.value[0])
  form.weekLabel = weekLabelFromStart(form.startDate)
  form.open = !blockingWeek.value
  copyFromId.value = weeks.value[0]?.id ?? ''
  form.opensAt = ''
  form.closesAt = ''
  labelEdited.value = false
}

// Fill the suggestion once the week list is known.
watch(
  () => weeks.value.length,
  (n, before) => {
    if (n && !before) resetForm()
  },
  { immediate: true },
)
watch(
  () => form.startDate,
  (date) => {
    if (!labelEdited.value) form.weekLabel = weekLabelFromStart(date)
  },
)

const createValidation = computed(() => {
  const label = form.weekLabel.trim()
  if (!label) return t('adminWeeks.labelRequired')
  if (weeks.value.some((w) => w.weekLabel === label)) return t('adminWeeks.labelTaken')
  if (form.open && blockingWeek.value) {
    return t('adminWeeks.onlyOneOpen', { week: blockingWeek.value.weekLabel })
  }
  const opens = fromLocalInput(form.opensAt)
  const closes = fromLocalInput(form.closesAt)
  if (opens && closes && closes <= opens) return t('adminWeeks.windowInvalid')
  return ''
})

async function create() {
  createError.value = ''
  created.value = null
  if (createValidation.value) {
    createError.value = createValidation.value
    return
  }
  const source = weeks.value.find((w) => w.id === copyFromId.value)
  creating.value = true
  try {
    const { week, config } = await adminApi.createWeek({
      weekLabel: form.weekLabel.trim(),
      startDate: form.startDate || null,
      ...(source && {
        rules: source.rules,
        slots1: source.slots1,
        slots2: source.slots2,
        capacity: source.capacity,
      }),
      open: form.open,
      opensAt: fromLocalInput(form.opensAt),
      closesAt: fromLocalInput(form.closesAt),
    })
    schedule.setConfig(config)
    created.value = week.weekLabel
    await load({ force: true })
    resetForm()
  } catch (e) {
    createError.value = errorMessage(e, t('adminWeeks.createFailed'))
  } finally {
    creating.value = false
  }
}

// --- Week list ------------------------------------------------------------------------

const togglingId = ref<string | null>(null)
const listError = ref('')

async function setOpen(week: WeekSummary, open: boolean) {
  listError.value = ''
  togglingId.value = week.id
  try {
    const { config } = await adminApi.updateWeek(week.id, { open })
    schedule.setConfig(config)
    await load({ force: true })
  } catch (e) {
    listError.value = errorMessage(e, t('adminWeeks.toggleFailed'))
  } finally {
    togglingId.value = null
  }
}

const rate = (present: number, absent: number) =>
  present + absent ? Math.round((present / (present + absent)) * 100) : null

function statusBadge(w: WeekSummary) {
  if (w.status === 'open') return { text: t('adminWeeks.badgeOpen'), tone: 'open' }
  if (w.status === 'upcoming' && w.opensAt) {
    return { text: t('adminWeeks.badgeUpcoming', { date: formatWhen(w.opensAt) }), tone: 'soon' }
  }
  if (w.open) return { text: t('adminWeeks.badgeEnded'), tone: 'muted' }
  return null
}

const BADGE = {
  open: 'bg-brand-50 text-brand-800 dark:bg-brand-400/10 dark:text-brand-200',
  soon: 'bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200',
  muted: 'bg-zinc-100 text-zinc-600 dark:bg-white/5 dark:text-zinc-400',
} as const

const inputClass =
  'block h-11 w-full rounded-xl bg-white px-3.5 text-sm text-zinc-900 ring-1 ring-zinc-950/10 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-brand-500 dark:bg-zinc-950/40 dark:text-white dark:ring-white/10 dark:[color-scheme:dark] dark:focus:ring-brand-400'
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300'
const hintClass = 'mt-1.5 text-xs text-zinc-500 dark:text-zinc-400'
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
    <BaseCard solid>
      <form class="space-y-5" novalidate @submit.prevent="create">
        <div>
          <h2 class="text-base font-semibold tracking-tight">{{ t('adminWeeks.newTitle') }}</h2>
          <p :class="hintClass">
            {{ t('adminWeeks.newIntro') }}
          </p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <div>
            <label for="w-start" :class="labelClass">{{ t('adminWeeks.startDate') }}</label>
            <input id="w-start" v-model="form.startDate" type="date" :class="inputClass" />
          </div>
          <div>
            <label for="w-label" :class="labelClass">{{ t('adminSettings.weekLabel') }}</label>
            <input
              id="w-label"
              v-model="form.weekLabel"
              maxlength="50"
              :placeholder="t('adminSettings.weekPlaceholder')"
              :class="inputClass"
              @input="labelEdited = true"
            />
          </div>
        </div>

        <div v-if="weeks.length">
          <label for="w-copy" :class="labelClass">{{ t('adminWeeks.copyFrom') }}</label>
          <select id="w-copy" v-model="copyFromId" :class="inputClass">
            <option v-for="w in weeks" :key="w.id" :value="w.id">
              {{ t('common.week', { week: w.weekLabel }) }}
            </option>
          </select>
          <p :class="hintClass">{{ t('adminWeeks.copyFromHint') }}</p>
        </div>

        <BaseSwitch
          v-model="form.open"
          :label="t('adminWeeks.openNow')"
          :description="
            blockingWeek
              ? t('adminWeeks.onlyOneOpen', { week: blockingWeek.weekLabel })
              : t('adminWeeks.openNowHint')
          "
        />

        <template v-if="form.open">
          <div>
            <label for="w-opens" :class="labelClass">{{ t('adminWeeks.opensAt') }}</label>
            <input id="w-opens" v-model="form.opensAt" type="datetime-local" :class="inputClass" />
            <p :class="hintClass">{{ t('adminWeeks.opensAtHint') }}</p>
          </div>
          <div>
            <label for="w-closes" :class="labelClass">{{ t('adminWeeks.closesAt') }}</label>
            <input
              id="w-closes"
              v-model="form.closesAt"
              type="datetime-local"
              :class="inputClass"
            />
            <p :class="hintClass">{{ t('adminWeeks.closesAtHint') }}</p>
          </div>
        </template>

        <BaseAlert v-if="createError" tone="danger">{{ createError }}</BaseAlert>
        <BaseAlert v-else-if="created" tone="success">
          {{ t('adminWeeks.created', { week: created }) }}
          <button
            type="button"
            class="ml-1 font-semibold underline underline-offset-4"
            @click="goTo('cai-dat', created)"
          >
            {{ t('adminWeeks.editSettings') }}
          </button>
        </BaseAlert>

        <BaseButton type="submit" block :icon="CalendarPlus" :loading="creating">
          {{ t('adminWeeks.create') }}
        </BaseButton>
      </form>
    </BaseCard>

    <BaseCard :padded="false" solid>
      <div class="flex items-center justify-between gap-3 p-4 sm:p-5">
        <div>
          <h2 class="text-base font-semibold tracking-tight">{{ t('adminWeeks.historyTitle') }}</h2>
          <p :class="hintClass">{{ t('adminWeeks.historyHint') }}</p>
        </div>
        <BaseButton
          variant="secondary"
          size="sm"
          :icon="RefreshCw"
          :loading="loading"
          @click="load({ force: true })"
        >
          {{ t('common.refresh') }}
        </BaseButton>
      </div>

      <BaseAlert v-if="listError" tone="danger" class="mx-4 mb-4 sm:mx-5">{{
        listError
      }}</BaseAlert>

      <div
        v-if="loading && !weeks.length"
        class="space-y-2 border-t border-zinc-950/5 p-4 dark:border-white/[0.07]"
        aria-busy="true"
      >
        <div
          v-for="n in 3"
          :key="n"
          class="h-16 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5"
        />
      </div>

      <EmptyState
        v-else-if="!weeks.length"
        class="border-t border-zinc-950/5 dark:border-white/[0.07]"
        :icon="History"
        :title="t('adminWeeks.historyEmpty')"
      />

      <ul
        v-else
        class="divide-y divide-zinc-950/5 border-t border-zinc-950/5 dark:divide-white/[0.07] dark:border-white/[0.07]"
      >
        <li
          v-for="w in weeks"
          :key="w.id"
          class="flex flex-col gap-3 px-4 py-4 sm:px-5 xl:flex-row xl:items-center xl:justify-between"
        >
          <div class="min-w-0">
            <p class="flex flex-wrap items-center gap-2 font-semibold">
              {{ t('common.week', { week: w.weekLabel }) }}
              <span
                v-if="statusBadge(w)"
                class="rounded-full px-2 py-0.5 text-xs font-medium"
                :class="BADGE[statusBadge(w)!.tone as keyof typeof BADGE]"
              >
                {{ statusBadge(w)!.text }}
              </span>
              <span
                v-if="w.current && !w.open"
                class="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-white/5 dark:text-zinc-400"
              >
                {{ t('adminWeeks.badgeCurrent') }}
              </span>
            </p>
            <p class="mt-0.5 text-sm text-zinc-600 tabular-nums dark:text-zinc-400">
              {{ t('adminWeeks.students', { n: w.bookings }, w.bookings) }} ·
              {{ t('adminWeeks.sessions', { n: w.sessions }, w.sessions) }}
              <template v-if="rate(w.present, w.absent) !== null">
                · {{ t('adminWeeks.attendance', { rate: rate(w.present, w.absent) }) }}
              </template>
            </p>
            <p v-if="w.open && w.closesAt" class="text-xs text-zinc-500">
              {{ t('adminWeeks.closesOn', { date: formatWhen(w.closesAt) }) }}
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            <BaseButton
              v-if="w.open"
              variant="secondary"
              size="sm"
              :icon="Lock"
              :loading="togglingId === w.id"
              @click="setOpen(w, false)"
            >
              {{ t('adminWeeks.close') }}
            </BaseButton>
            <BaseButton
              v-else
              variant="soft"
              size="sm"
              :icon="LockOpen"
              :loading="togglingId === w.id"
              :disabled="!!blockingWeek"
              :title="
                blockingWeek ? t('adminWeeks.onlyOneOpen', { week: blockingWeek.weekLabel }) : ''
              "
              @click="setOpen(w, true)"
            >
              {{ t('adminWeeks.open') }}
            </BaseButton>
            <BaseButton
              variant="secondary"
              size="sm"
              :icon="ClipboardList"
              @click="goTo('dang-ky', w.weekLabel)"
            >
              {{ t('adminWeeks.viewBookings') }}
            </BaseButton>
            <BaseButton
              variant="secondary"
              size="sm"
              :icon="ClipboardCheck"
              @click="goTo('diem-danh', w.weekLabel)"
            >
              {{ t('adminWeeks.viewAttendance') }}
            </BaseButton>
            <BaseButton
              variant="ghost"
              size="sm"
              :icon="Settings2"
              :aria-label="t('adminWeeks.settingsLabel', { week: w.weekLabel })"
              @click="goTo('cai-dat', w.weekLabel)"
            />
          </div>
        </li>
      </ul>
      <p
        v-if="blockingWeek && weeks.length > 1"
        class="border-t border-zinc-950/5 px-4 py-3 text-xs text-zinc-500 sm:px-5 dark:border-white/[0.07] dark:text-zinc-400"
      >
        {{ t('adminWeeks.onlyOneOpen', { week: blockingWeek.weekLabel }) }}
      </p>
    </BaseCard>
  </div>
</template>
