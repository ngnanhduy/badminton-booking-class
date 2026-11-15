<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ClipboardCheck, ClipboardList, Clock, Save } from '@lucide/vue'

import WeekDateField from '@/components/admin/WeekDateField.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import DateTimeInput from '@/components/ui/DateTimeInput.vue'
import { useAdminWeeks } from '@/composables/useAdminWeeks'
import { formatWhen } from '@/i18n/format'
import { adminApi } from '@/services/admin'
import { errorMessage } from '@/services/api'
import { useScheduleStore } from '@/stores/schedule'
import type { Week } from '@/types/admin'
import { fromLocalInput, startDateOf, toLocalInput } from '@/utils/week'

/** The chosen week's dates and when booking for it opens and closes. */
const props = defineProps<{
  /** Shown above the form, e.g. after creating this week. */
  notice?: string
}>()
const emit = defineEmits<{ dismissNotice: []; editSchedule: [] }>()

const { t } = useI18n()
const schedule = useScheduleStore()
const { weeks, load, selected, openWeek, selectWeek, goTo } = useAdminWeeks()

const form = reactive({ weekLabel: '', startDate: '', open: false, opensAt: '', closesAt: '' })
const saving = ref(false)
const error = ref('')
const saved = ref(false)

function fill(week: Week) {
  form.weekLabel = week.weekLabel
  // Older weeks have no saved date: start from the one in their label.
  form.startDate = startDateOf(week)
  form.open = week.open
  form.opensAt = toLocalInput(week.opensAt)
  form.closesAt = toLocalInput(week.closesAt)
}

// Fill when another week is chosen; refreshes of the list don't overwrite unsaved edits.
watch(
  () => selected.value?.id,
  (id, before) => {
    error.value = ''
    saved.value = false
    if (before && props.notice) emit('dismissNotice')
    if (selected.value) fill(selected.value)
  },
  { immediate: true },
)

const weekError = computed(() => {
  const label = form.weekLabel.trim()
  if (!label) return t('adminWeeks.labelRequired')
  const taken = weeks.value.some((w) => w.id !== selected.value?.id && w.weekLabel === label)
  return taken ? t('adminWeeks.labelTaken') : ''
})
/** Changing the week's dates (or name) also renames the bookings already made for it. */
const renamesBookings = computed(
  () => !!selected.value?.bookings && form.weekLabel.trim() !== selected.value.weekLabel,
)
const windowError = computed(() => {
  const opens = fromLocalInput(form.opensAt)
  const closes = fromLocalInput(form.closesAt)
  return opens && closes && closes <= opens ? t('adminWeeks.windowInvalid') : ''
})
/** Another week is open (and not past its closing time), so this one can't be opened. */
const blockingWeek = computed(() => {
  const other = openWeek.value
  return other && other.id !== selected.value?.id && other.status !== 'closed' ? other : undefined
})
const openError = computed(() =>
  form.open && !selected.value?.open && blockingWeek.value
    ? t('adminWeeks.onlyOneOpen', { week: blockingWeek.value.weekLabel })
    : '',
)

/** Where booking stands now (as saved). */
const status = computed(() => {
  const w = selected.value
  if (!w) return null
  if (w.status === 'open') {
    return {
      tone: 'open',
      text: w.closesAt
        ? t('adminWeeks.statusOpenUntil', { date: formatWhen(w.closesAt) })
        : t('adminWeeks.badgeOpen'),
    }
  }
  if (w.status === 'upcoming' && w.opensAt) {
    return { tone: 'soon', text: t('adminWeeks.badgeUpcoming', { date: formatWhen(w.opensAt) }) }
  }
  return {
    tone: 'muted',
    text: w.open ? t('adminWeeks.badgeEnded') : t('adminWeeks.statusClosed'),
  }
})
const STATUS_CLASS = {
  open: 'bg-brand-50 text-brand-800 ring-brand-600/15 dark:bg-brand-400/10 dark:text-brand-200 dark:ring-brand-400/20',
  soon: 'bg-amber-50 text-amber-800 ring-amber-600/15 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20',
  muted:
    'bg-zinc-100 text-zinc-600 ring-zinc-950/5 dark:bg-white/5 dark:text-zinc-400 dark:ring-white/10',
} as const

async function save() {
  error.value = ''
  saved.value = false
  const week = selected.value
  if (!week) return
  const invalid = weekError.value || openError.value || windowError.value
  if (invalid) {
    error.value = invalid
    return
  }
  saving.value = true
  try {
    const { week: updated, config } = await adminApi.updateWeek(week.id, {
      weekLabel: form.weekLabel.trim(),
      startDate: form.startDate || null,
      open: form.open,
      opensAt: fromLocalInput(form.opensAt),
      closesAt: fromLocalInput(form.closesAt),
    })
    schedule.setConfig(config)
    await load({ force: true })
    // A renamed week keeps its place in the URL.
    if (updated.weekLabel !== week.weekLabel && !week.current) selectWeek(updated.weekLabel)
    fill(updated)
    saved.value = true
  } catch (e) {
    error.value = errorMessage(e, t('adminSettings.saveFailed'))
  } finally {
    saving.value = false
  }
}

const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300'
const hintClass = 'mt-1.5 text-xs text-zinc-500 dark:text-zinc-400'
const errorClass = 'mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400'
</script>

<template>
  <div v-if="selected" class="space-y-4">
    <BaseAlert v-if="notice" tone="success">
      {{ notice }}
      <button
        type="button"
        class="ml-1 font-semibold underline underline-offset-4"
        @click="emit('editSchedule')"
      >
        {{ t('adminWeeks.editSchedule') }}
      </button>
    </BaseAlert>

    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-xl font-bold tracking-tight">
          {{ t('common.week', { week: selected.weekLabel }) }}
        </h2>
        <span
          v-if="status"
          class="rounded-full px-2.5 py-0.5 text-xs font-medium ring-1"
          :class="STATUS_CLASS[status.tone as keyof typeof STATUS_CLASS]"
        >
          {{ status.text }}
        </span>
      </div>
      <div class="flex flex-wrap gap-2 sm:shrink-0">
        <BaseButton
          variant="secondary"
          size="sm"
          :icon="ClipboardList"
          @click="goTo('dang-ky', selected.weekLabel)"
        >
          {{ t('adminWeeks.viewBookings') }}
        </BaseButton>
        <BaseButton
          variant="secondary"
          size="sm"
          :icon="ClipboardCheck"
          @click="goTo('diem-danh', selected.weekLabel)"
        >
          {{ t('adminWeeks.viewAttendance') }}
        </BaseButton>
        <BaseButton variant="secondary" size="sm" :icon="Clock" @click="emit('editSchedule')">
          {{ t('adminWeeks.editSchedule') }}
        </BaseButton>
      </div>
    </div>

    <form class="space-y-4" novalidate @submit.prevent="save">
      <BaseCard class="space-y-5" solid>
        <h3 class="text-base font-semibold tracking-tight">
          {{ t('adminSettings.bookingSection') }}
        </h3>
        <div>
          <BaseSwitch
            v-model="form.open"
            :label="t('adminSettings.open')"
            :description="t('adminSettings.openHint')"
          />
          <p v-if="openError" :class="errorClass">{{ openError }}</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="s-opens" :class="labelClass">{{ t('adminWeeks.opensAt') }}</label>
            <DateTimeInput
              id="s-opens"
              v-model="form.opensAt"
              :placeholder="t('adminWeeks.opensAtPlaceholder')"
            />
            <p :class="hintClass">{{ t('adminWeeks.opensAtHint') }}</p>
          </div>
          <div>
            <label for="s-closes" :class="labelClass">{{ t('adminWeeks.closesAt') }}</label>
            <DateTimeInput
              id="s-closes"
              v-model="form.closesAt"
              :placeholder="t('adminWeeks.closesAtPlaceholder')"
              :invalid="!!windowError"
            />
            <p v-if="windowError" :class="errorClass">{{ windowError }}</p>
            <p v-else :class="hintClass">{{ t('adminWeeks.closesAtHint') }}</p>
          </div>
        </div>
      </BaseCard>

      <BaseCard class="space-y-5" solid>
        <h3 class="text-base font-semibold tracking-tight">
          {{ t('adminSettings.weekSection') }}
        </h3>
        <WeekDateField
          v-model:start-date="form.startDate"
          v-model:label="form.weekLabel"
          :error="weekError"
          :hint="renamesBookings ? t('adminSettings.weekHint') : undefined"
          :warn="renamesBookings"
        />
      </BaseCard>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <BaseButton type="submit" :icon="Save" :loading="saving">
          {{ t('adminSettings.save') }}
        </BaseButton>
        <BaseAlert v-if="error" tone="danger" class="flex-1">{{ error }}</BaseAlert>
        <BaseAlert v-else-if="saved" tone="success" class="flex-1">
          {{ t('adminSettings.saved') }}
        </BaseAlert>
      </div>
    </form>
  </div>
  <div
    v-else
    class="h-96 animate-pulse rounded-2xl bg-white/60 ring-1 ring-zinc-950/5 dark:bg-zinc-900/50 dark:ring-white/10"
    aria-busy="true"
  />
</template>
