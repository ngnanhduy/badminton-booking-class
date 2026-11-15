<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Copy, Save } from '@lucide/vue'

import SlotScheduleEditor from '@/components/admin/SlotScheduleEditor.vue'
import WeekPicker from '@/components/admin/WeekPicker.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { useAdminWeeks } from '@/composables/useAdminWeeks'
import { adminApi } from '@/services/admin'
import { errorMessage } from '@/services/api'
import { useScheduleStore } from '@/stores/schedule'
import type { Week } from '@/types/admin'
import {
  draftsFromSlots,
  slotsFromDrafts,
  validateDrafts,
  type SlotDraft,
} from '@/utils/slotEditor'
import { fromLocalInput, toLocalInput } from '@/utils/week'

/** Settings of one week (the current week, or the one chosen in the week picker). */
const { t } = useI18n()
const schedule = useScheduleStore()
const { weeks, load, selected, openWeek, selectWeek } = useAdminWeeks()

onMounted(() => load())

const form = reactive({
  weekLabel: '',
  startDate: '',
  open: false,
  opensAt: '',
  closesAt: '',
  capacity: '',
  rules: '',
})
/** The week's time slots, edited day by day. */
const drafts = ref<SlotDraft[]>([])
const saving = ref(false)
const error = ref('')
const saved = ref(false)
/** Set after copying another week's settings, until saved or undone. */
const copiedFrom = ref('')
const copySourceId = ref('')

function fillSettings(week: Pick<Week, 'capacity' | 'rules'>) {
  form.capacity = week.capacity ? String(week.capacity) : ''
  form.rules = week.rules.join('\n')
}

function fill(week: Week) {
  form.weekLabel = week.weekLabel
  form.startDate = week.startDate ?? ''
  form.open = week.open
  form.opensAt = toLocalInput(week.opensAt)
  form.closesAt = toLocalInput(week.closesAt)
  fillSettings(week)
  drafts.value = draftsFromSlots(week.slots1, week.slots2)
  copiedFrom.value = ''
}

/** Weeks to copy from: every other week, the one just before the selected week first. */
const copySources = computed(() => {
  const list = weeks.value
  const index = list.findIndex((w) => w.id === selected.value?.id)
  return [...list.slice(index + 1), ...list.slice(0, Math.max(index, 0))]
})

// Fill when another week is chosen; refreshes of the list don't overwrite unsaved edits.
watch(
  () => selected.value?.id,
  () => {
    error.value = ''
    saved.value = false
    if (selected.value) fill(selected.value)
    copySourceId.value = copySources.value[0]?.id ?? ''
  },
  { immediate: true },
)

/**
 * Copies slots, rules and capacity from another week into the form; nothing is saved until
 * "Save settings". Slots this week already has keep their bookings.
 */
function copyFromWeek() {
  const source = weeks.value.find((w) => w.id === copySourceId.value)
  const week = selected.value
  if (!source || !week) return
  fillSettings(source)
  drafts.value = draftsFromSlots(
    source.slots1,
    source.slots2,
    new Set([...week.slots1, ...week.slots2]),
  )
  // Slots of this week that the copy doesn't have: shown as removed, so it's visible.
  const kept = new Set(drafts.value.map((d) => d.original))
  for (const old of draftsFromSlots(week.slots1, week.slots2)) {
    if (!kept.has(old.original)) drafts.value.push({ ...old, removed: true })
  }
  copiedFrom.value = source.weekLabel
  saved.value = false
  error.value = ''
}

function undoCopy() {
  if (selected.value) fill(selected.value)
}

const slotCheck = computed(() => validateDrafts(drafts.value))
const removedCount = computed(() => drafts.value.filter((d) => d.removed).length)

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

const slotsError = computed(() => {
  const check = slotCheck.value
  if (Object.keys(check.issues).length) return t('slotEditor.fixIssues')
  if (check.missingSession1) return t('slotEditor.needSession1')
  if (check.missingSessions23) return t('slotEditor.needSessions23')
  return ''
})

const capacityError = computed(() => {
  if (!form.capacity.trim()) return ''
  const n = Number(form.capacity)
  return Number.isInteger(n) && n > 0 ? '' : t('adminSettings.capacityError')
})
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

async function save() {
  error.value = ''
  saved.value = false
  const week = selected.value
  if (!week || capacityError.value || windowError.value || openError.value) return
  if (slotsError.value) {
    error.value = slotsError.value
    return
  }
  if (!form.weekLabel.trim()) {
    error.value = t('adminWeeks.labelRequired')
    return
  }
  const { slots1, slots2, renames } = slotsFromDrafts(drafts.value)
  saving.value = true
  try {
    const { week: updated, config } = await adminApi.updateWeek(week.id, {
      weekLabel: form.weekLabel.trim(),
      startDate: form.startDate || null,
      open: form.open,
      opensAt: fromLocalInput(form.opensAt),
      closesAt: fromLocalInput(form.closesAt),
      capacity: form.capacity.trim() ? Number(form.capacity) : null,
      rules: lines(form.rules),
      slots1,
      slots2,
      ...(renames.length && { slotRenames: renames }),
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

const inputClass =
  'block w-full rounded-xl bg-white px-3.5 text-sm text-zinc-900 ring-1 ring-zinc-950/10 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-brand-500 dark:bg-zinc-950/40 dark:text-white dark:ring-white/10 dark:[color-scheme:dark] dark:focus:ring-brand-400'
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300'
const hintClass = 'mt-1.5 text-xs text-zinc-500 dark:text-zinc-400'
const errorClass = 'mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400'
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <WeekPicker class="sm:w-80" />
      <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('adminSettings.perWeekHint') }}</p>
    </div>

    <BaseCard v-if="selected && copySources.length" :padded="false" solid>
      <div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
        <label for="s-copy" class="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {{ t('adminSettings.copyFrom') }}
        </label>
        <select
          id="s-copy"
          v-model="copySourceId"
          class="h-10 rounded-xl bg-white px-3 text-sm ring-1 ring-zinc-950/10 outline-none focus:ring-2 focus:ring-brand-500 sm:w-64 dark:bg-zinc-950/40 dark:ring-white/10"
        >
          <option v-for="w in copySources" :key="w.id" :value="w.id">
            {{ t('common.week', { week: w.weekLabel }) }}
          </option>
        </select>
        <BaseButton variant="secondary" size="sm" :icon="Copy" @click="copyFromWeek">
          {{ t('adminSettings.copy') }}
        </BaseButton>
        <p class="text-xs text-zinc-500 sm:ml-auto sm:max-w-xs dark:text-zinc-400">
          {{ t('adminSettings.copyHint') }}
        </p>
      </div>
      <BaseAlert v-if="copiedFrom" tone="info" class="mx-4 mb-4 sm:mx-5">
        {{ t('adminSettings.copied', { week: copiedFrom }) }}
        <button
          type="button"
          class="ml-1 font-semibold underline underline-offset-4"
          @click="undoCopy"
        >
          {{ t('slotEditor.undo') }}
        </button>
      </BaseAlert>
    </BaseCard>

    <form
      v-if="selected"
      class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
      novalidate
      @submit.prevent="save"
    >
      <BaseCard class="space-y-5" solid>
        <h2 class="text-base font-semibold tracking-tight">
          {{ t('adminSettings.weekSection') }}
        </h2>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="s-week" :class="labelClass">{{ t('adminSettings.weekLabel') }}</label>
            <input
              id="s-week"
              v-model="form.weekLabel"
              maxlength="50"
              :placeholder="t('adminSettings.weekPlaceholder')"
              :class="[inputClass, 'h-11']"
            />
            <p :class="hintClass">{{ t('adminSettings.weekHint') }}</p>
          </div>
          <div>
            <label for="s-start" :class="labelClass">{{ t('adminWeeks.startDate') }}</label>
            <input
              id="s-start"
              v-model="form.startDate"
              type="date"
              :class="[inputClass, 'h-11']"
            />
            <p :class="hintClass">{{ t('adminWeeks.startDateHint') }}</p>
          </div>
        </div>
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
            <input
              id="s-opens"
              v-model="form.opensAt"
              type="datetime-local"
              :class="[inputClass, 'h-11']"
            />
            <p :class="hintClass">{{ t('adminWeeks.opensAtHint') }}</p>
          </div>
          <div>
            <label for="s-closes" :class="labelClass">{{ t('adminWeeks.closesAt') }}</label>
            <input
              id="s-closes"
              v-model="form.closesAt"
              type="datetime-local"
              :aria-invalid="!!windowError"
              :class="[inputClass, 'h-11']"
            />
            <p v-if="windowError" :class="errorClass">{{ windowError }}</p>
            <p v-else :class="hintClass">{{ t('adminWeeks.closesAtHint') }}</p>
          </div>
        </div>
      </BaseCard>

      <BaseCard class="space-y-5" solid>
        <h2 class="text-base font-semibold tracking-tight">
          {{ t('adminSettings.classSection') }}
        </h2>
        <div>
          <label for="s-capacity" :class="labelClass">{{ t('adminSettings.capacity') }}</label>
          <input
            id="s-capacity"
            v-model="form.capacity"
            inputmode="numeric"
            :placeholder="t('adminSettings.capacityPlaceholder')"
            :aria-invalid="!!capacityError"
            :class="[inputClass, 'h-11 max-w-40']"
          />
          <p v-if="capacityError" :class="errorClass">{{ capacityError }}</p>
          <p v-else :class="hintClass">{{ t('adminSettings.capacityHint') }}</p>
        </div>
        <div>
          <label for="s-rules" :class="labelClass">{{ t('adminSettings.rules') }}</label>
          <textarea id="s-rules" v-model="form.rules" rows="5" :class="[inputClass, 'py-2.5']" />
          <p :class="hintClass">{{ t('adminSettings.rulesHint') }}</p>
        </div>
      </BaseCard>

      <BaseCard class="space-y-4 lg:col-span-2" solid>
        <div>
          <h2 class="text-base font-semibold tracking-tight">
            {{ t('adminSettings.slotsSection') }}
          </h2>
          <p :class="hintClass">{{ t('slotEditor.intro') }}</p>
        </div>
        <SlotScheduleEditor v-model="drafts" :counts="selected.counts" :issues="slotCheck.issues" />
        <p v-if="slotsError" :class="errorClass">{{ slotsError }}</p>
        <p v-else-if="removedCount" class="text-xs font-medium text-amber-700 dark:text-amber-300">
          {{ t('slotEditor.removedSummary', { n: removedCount }, removedCount) }}
        </p>
      </BaseCard>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center lg:col-span-2">
        <BaseButton type="submit" size="lg" :icon="Save" :loading="saving">
          {{ t('adminSettings.save') }}
        </BaseButton>
        <BaseAlert v-if="error" tone="danger" class="flex-1">{{ error }}</BaseAlert>
        <BaseAlert v-else-if="saved" tone="success" class="flex-1">
          {{ t('adminSettings.saved') }}
        </BaseAlert>
      </div>
    </form>
    <div
      v-else
      class="h-96 animate-pulse rounded-2xl bg-white/60 ring-1 ring-zinc-950/5 dark:bg-zinc-900/50 dark:ring-white/10"
      aria-busy="true"
    />
  </div>
</template>
