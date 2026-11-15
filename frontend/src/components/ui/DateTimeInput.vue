<script setup lang="ts">
import { computed } from 'vue'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import { CalendarClock } from '@lucide/vue'

import { useDatePicker } from '@/composables/useDatePicker'
import { formatWhen } from '@/i18n/format'
import { toLocalInput } from '@/utils/week'

/**
 * Date and 24-hour time field, bound to a local "YYYY-MM-DDTHH:mm" value ("" when empty,
 * the same format as `<input type="datetime-local">`). Can be cleared.
 */
const model = defineModel<string>({ required: true })
const props = defineProps<{
  id?: string
  placeholder?: string
  invalid?: boolean
}>()

const picker = useDatePicker()

const date = computed<Date | null>({
  get: () => {
    const d = model.value ? new Date(model.value) : null
    return d && !Number.isNaN(d.getTime()) ? d : null
  },
  set: (value) => {
    model.value = value ? toLocalInput(value.toISOString()) : ''
  },
})

const inputAttrs = computed(() => ({
  id: props.id,
  clearable: true,
  ...(props.invalid && { state: false }),
}))
</script>

<template>
  <VueDatePicker
    v-model="date"
    :placeholder="placeholder"
    :locale="picker.locale"
    :week-start="picker.weekStart"
    :day-names="picker.dayNames"
    :action-row="picker.actionRow"
    :aria-labels="picker.ariaLabels"
    :time-config="{ enableTimePicker: true, is24: true, minutesIncrement: 5 }"
    :formats="{ input: (d: Date) => formatWhen(d.toISOString()) }"
    :input-attrs="inputAttrs"
  >
    <template #input-icon>
      <CalendarClock class="dp-app-icon" aria-hidden="true" />
    </template>
  </VueDatePicker>
</template>
