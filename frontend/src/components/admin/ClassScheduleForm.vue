<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Copy, Save } from '@lucide/vue'

import SlotScheduleEditor from '@/components/admin/SlotScheduleEditor.vue'
import WeekPicker from '@/components/admin/WeekPicker.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
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

/** The chosen week's class times (slots per day), places per slot and rules. */
const { t } = useI18n()
const schedule = useScheduleStore()
const { weeks, load, selected } = useAdminWeeks()

const form = reactive({ capacity: '', rules: '' })
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
  fillSettings(week)
  drafts.value = draftsFromSlots(week)
  copiedFrom.value = ''
}

/** Weeks to copy from: every other week, the one just before the selected week first. */
const copySources = computed(() => {
  const list = weeks.value
  const index = list.findIndex((w) => w.id === selected.value?.id)
  return [...list.slice(index + 1), ...list.slice(0, Math.max(index, 0))]
})
const copyOptions = computed(() =>
  copySources.value.map((w) => ({
    value: w.id,
    label: t('common.week', { week: w.weekLabel }),
    hint: t('adminWeeks.students', { n: w.bookings }, w.bookings),
  })),
)

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
  drafts.value = draftsFromSlots(source, new Set([...week.slots1, ...week.slots2, ...week.slots3]))
  // Slots of this week that the copy doesn't have: shown as removed, so it's visible.
  const kept = new Set(drafts.value.map((d) => d.original))
  for (const old of draftsFromSlots(week)) {
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
  const missing = check.missingSessions[0]
  if (missing) return t('slotEditor.needSession', { n: missing })
  return ''
})
const capacityError = computed(() => {
  if (!form.capacity.trim()) return ''
  const n = Number(form.capacity)
  return Number.isInteger(n) && n > 0 ? '' : t('adminSettings.capacityError')
})

async function save() {
  error.value = ''
  saved.value = false
  const week = selected.value
  if (!week) return
  const invalid = slotsError.value || capacityError.value
  if (invalid) {
    error.value = invalid
    return
  }
  const { slots1, slots2, slots3, renames } = slotsFromDrafts(drafts.value)
  saving.value = true
  try {
    const { week: updated, config } = await adminApi.updateWeek(week.id, {
      capacity: form.capacity.trim() ? Number(form.capacity) : null,
      rules: lines(form.rules),
      slots1,
      slots2,
      slots3,
      ...(renames.length && { slotRenames: renames }),
    })
    schedule.setConfig(config)
    await load({ force: true })
    fill(updated)
    saved.value = true
  } catch (e) {
    error.value = errorMessage(e, t('adminSettings.saveFailed'))
  } finally {
    saving.value = false
  }
}

const inputClass =
  'block w-full rounded-xl bg-white px-3.5 text-sm text-zinc-900 ring-1 ring-zinc-950/10 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-brand-500 dark:bg-zinc-950/40 dark:text-white dark:ring-white/10 dark:focus:ring-brand-400'
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300'
const hintClass = 'mt-1.5 text-xs text-zinc-500 dark:text-zinc-400'
const errorClass = 'mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400'
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <WeekPicker class="sm:w-96" />
      <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('adminSettings.perWeekHint') }}</p>
    </div>

    <template v-if="selected">
      <BaseCard v-if="copySources.length" :padded="false" solid>
        <div class="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:p-5">
          <label for="s-copy" class="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {{ t('adminSettings.copyFrom') }}
          </label>
          <BaseSelect
            id="s-copy"
            v-model="copySourceId"
            :options="copyOptions"
            size="sm"
            class="sm:w-64"
          />
          <BaseButton variant="secondary" size="sm" :icon="Copy" @click="copyFromWeek">
            {{ t('adminSettings.copy') }}
          </BaseButton>
          <p class="text-xs text-zinc-500 lg:ml-auto lg:max-w-xs dark:text-zinc-400">
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

      <form class="space-y-4" novalidate @submit.prevent="save">
        <BaseCard class="space-y-4" solid>
          <div>
            <h3 class="text-base font-semibold tracking-tight">
              {{ t('adminSettings.slotsSection') }}
            </h3>
            <p :class="hintClass">{{ t('slotEditor.intro') }}</p>
          </div>
          <SlotScheduleEditor
            v-model="drafts"
            :counts="selected.counts"
            :issues="slotCheck.issues"
          />
          <p v-if="slotsError" :class="errorClass">{{ slotsError }}</p>
          <p
            v-else-if="removedCount"
            class="text-xs font-medium text-amber-700 dark:text-amber-300"
          >
            {{ t('slotEditor.removedSummary', { n: removedCount }, removedCount) }}
          </p>
        </BaseCard>

        <BaseCard solid>
          <h3 class="text-base font-semibold tracking-tight">
            {{ t('adminSettings.classSection') }}
          </h3>
          <div class="mt-5 grid gap-5 md:grid-cols-[14rem_minmax(0,1fr)]">
            <div>
              <label for="s-capacity" :class="labelClass">{{ t('adminSettings.capacity') }}</label>
              <input
                id="s-capacity"
                v-model="form.capacity"
                inputmode="numeric"
                :placeholder="t('adminSettings.capacityPlaceholder')"
                :aria-invalid="!!capacityError"
                :class="[inputClass, 'h-11']"
              />
              <p v-if="capacityError" :class="errorClass">{{ capacityError }}</p>
              <p v-else :class="hintClass">{{ t('adminSettings.capacityHint') }}</p>
            </div>
            <div>
              <label for="s-rules" :class="labelClass">{{ t('adminSettings.rules') }}</label>
              <textarea
                id="s-rules"
                v-model="form.rules"
                rows="4"
                :class="[inputClass, 'py-2.5']"
              />
              <p :class="hintClass">{{ t('adminSettings.rulesHint') }}</p>
            </div>
          </div>
        </BaseCard>

        <div
          class="sticky bottom-3 z-10 flex flex-col gap-3 rounded-2xl bg-white/85 p-3 ring-1 ring-zinc-950/[0.06] backdrop-blur sm:flex-row sm:items-center dark:bg-zinc-900/85 dark:ring-white/10"
        >
          <BaseButton type="submit" :icon="Save" :loading="saving">
            {{ t('adminSettings.save') }}
          </BaseButton>
          <BaseAlert v-if="error" tone="danger" class="flex-1">{{ error }}</BaseAlert>
          <BaseAlert v-else-if="saved" tone="success" class="flex-1">
            {{ t('adminSettings.saved') }}
          </BaseAlert>
        </div>
      </form>
    </template>
    <div
      v-else
      class="h-96 animate-pulse rounded-2xl bg-white/60 ring-1 ring-zinc-950/5 dark:bg-zinc-900/50 dark:ring-white/10"
      aria-busy="true"
    />
  </div>
</template>
