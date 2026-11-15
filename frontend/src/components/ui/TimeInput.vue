<script setup lang="ts">
import { computed } from 'vue'
import { VueDatePicker, type TimeModel } from '@vuepic/vue-datepicker'
import { Clock } from '@lucide/vue'

import { useDatePicker } from '@/composables/useDatePicker'

/** 24-hour time field bound to "HH:mm" ("" when empty), in 15-minute steps. */
const model = defineModel<string>({ required: true })
const props = withDefaults(
  defineProps<{
    id?: string
    /** Accessible name when there is no visible label. */
    label?: string
    invalid?: boolean
    disabled?: boolean
    size?: 'sm' | 'md'
  }>(),
  { size: 'md' },
)

const picker = useDatePicker()
const pad = (n: number | string) => String(n).padStart(2, '0')

const time = computed<TimeModel | null>({
  get: () => {
    const match = model.value.match(/^(\d{1,2}):(\d{2})$/)
    return match ? { hours: Number(match[1]), minutes: Number(match[2]) } : null
  },
  set: (value) => {
    model.value = value ? `${pad(value.hours)}:${pad(value.minutes)}` : ''
  },
})

const inputAttrs = computed(() => ({
  id: props.id,
  clearable: false,
  // Compact fields only show the time.
  hideInputIcon: props.size === 'sm',
  ...(props.invalid && { state: false }),
}))
</script>

<template>
  <VueDatePicker
    v-model="time"
    time-picker
    :disabled="disabled"
    :locale="picker.locale"
    :action-row="picker.actionRow"
    :aria-labels="{ ...picker.ariaLabels, input: label ?? '' }"
    :text-input="{
      format: ['HH:mm', 'H:mm', 'HHmm', 'H'],
      selectOnFocus: true,
      applyOnBlur: true,
    }"
    :time-config="{
      is24: true,
      minutesIncrement: 15,
      noHoursOverlay: true,
      noMinutesOverlay: true,
    }"
    :config="{ modeHeight: 132 }"
    style="--dp-menu-min-width: 12rem"
    :input-attrs="inputAttrs"
    :ui="{ input: size === 'sm' ? 'dp-input-sm' : undefined }"
  >
    <template #input-icon>
      <Clock class="dp-app-icon" aria-hidden="true" />
    </template>
  </VueDatePicker>
</template>
