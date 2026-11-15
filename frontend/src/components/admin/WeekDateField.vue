<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import { CalendarRange, PenLine, RotateCcw } from '@lucide/vue'

import { useDatePicker } from '@/composables/useDatePicker'
import { intlLocale } from '@/i18n'
import { fromDateInput, mondayOf, toDateInput, weekLabelFromStart } from '@/utils/week'

/**
 * Chooses a week in a calendar (Monday → Sunday). The week's label ("16/11 - 22/11")
 * follows the dates, but can still be renamed by hand.
 */
const startDate = defineModel<string>('startDate', { required: true })
const label = defineModel<string>('label', { required: true })
defineProps<{
  error?: string
  hint?: string
  /** Shows `hint` as a warning (e.g. renaming a week that has bookings). */
  warn?: boolean
}>()

const { t } = useI18n()
const id = useId()
const picker = useDatePicker()
const labelInput = useTemplateRef<HTMLInputElement>('labelInput')

const autoLabel = computed(() => weekLabelFromStart(startDate.value))
const renaming = ref(false)
const custom = computed(() => renaming.value || label.value !== autoLabel.value)

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** The picker's value: the week's first and last day. */
const week = computed<Date[] | null>({
  get: () => {
    const start = fromDateInput(startDate.value)
    return start ? [start, addDays(start, 6)] : null
  },
  set: (dates) => pick(dates?.[0] ? toDateInput(dates[0]) : ''),
})

function pick(date: string) {
  const monday = mondayOf(date)
  if (monday === startDate.value) return
  // The label follows the date unless it was renamed.
  if (!label.value || label.value === autoLabel.value) label.value = weekLabelFromStart(monday)
  startDate.value = monday
}

/** "T2, 16/11 → CN, 22/11" / "Mon 16/11 → Sun 22/11" */
function formatWeek(dates: Date | Date[]) {
  const [start] = Array.isArray(dates) ? dates : [dates]
  if (!start) return ''
  const format = (d: Date) =>
    d.toLocaleDateString(intlLocale(), { weekday: 'short', day: 'numeric', month: 'numeric' })
  return `${format(start)} → ${format(addDays(start, 6))}`
}

async function rename() {
  renaming.value = true
  await nextTick()
  labelInput.value?.select()
}

function useDateLabel() {
  label.value = autoLabel.value
  renaming.value = false
}

const linkClass =
  'inline-flex items-center gap-1 rounded text-xs font-semibold text-brand-700 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none dark:text-brand-300'
</script>

<template>
  <div>
    <label
      :for="`${id}-week`"
      class="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
    >
      {{ t('weekField.label') }}
    </label>
    <VueDatePicker
      v-model="week"
      week-picker
      auto-apply
      class="sm:max-w-72"
      :locale="picker.locale"
      :week-start="picker.weekStart"
      :day-names="picker.dayNames"
      :aria-labels="picker.ariaLabels"
      :time-config="{ enableTimePicker: false }"
      :placeholder="t('weekField.placeholder')"
      :formats="{ input: formatWeek }"
      :input-attrs="{ id: `${id}-week`, clearable: false, ...(error && { state: false }) }"
    >
      <template #input-icon>
        <CalendarRange class="dp-app-icon" aria-hidden="true" />
      </template>
    </VueDatePicker>

    <div v-if="custom" class="mt-3">
      <label
        :for="`${id}-label`"
        class="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400"
      >
        {{ t('adminSettings.weekLabel') }}
      </label>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <input
          :id="`${id}-label`"
          ref="labelInput"
          v-model="label"
          maxlength="50"
          :placeholder="t('adminSettings.weekPlaceholder')"
          class="block h-10 w-full rounded-xl bg-white px-3.5 text-sm text-zinc-900 ring-1 ring-zinc-950/10 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-brand-500 sm:max-w-72 dark:bg-zinc-950/40 dark:text-white dark:ring-white/10 dark:focus:ring-brand-400"
          @blur="renaming = label !== autoLabel"
        />
        <button v-if="autoLabel" type="button" :class="linkClass" @click="useDateLabel">
          <RotateCcw class="size-3.5" aria-hidden="true" />
          {{ t('weekField.useDate', { label: autoLabel }) }}
        </button>
      </div>
    </div>
    <p
      v-else-if="label"
      class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400"
    >
      <span>
        {{ t('adminSettings.weekLabel') }}:
        <span class="font-semibold text-zinc-800 dark:text-zinc-200">{{ label }}</span>
      </span>
      <button type="button" :class="linkClass" @click="rename">
        <PenLine class="size-3.5" aria-hidden="true" />
        {{ t('weekField.rename') }}
      </button>
    </p>

    <p
      class="mt-1.5 text-xs"
      :class="
        error
          ? 'font-medium text-rose-600 dark:text-rose-400'
          : warn
            ? 'text-amber-700 dark:text-amber-300'
            : 'text-zinc-500 dark:text-zinc-400'
      "
    >
      {{ error || hint || t('weekField.hint') }}
    </p>
  </div>
</template>
