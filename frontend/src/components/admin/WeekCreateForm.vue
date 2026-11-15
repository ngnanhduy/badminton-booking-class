<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarPlus } from '@lucide/vue'

import WeekDateField from '@/components/admin/WeekDateField.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import DateTimeInput from '@/components/ui/DateTimeInput.vue'
import { useAdminWeeks } from '@/composables/useAdminWeeks'
import { adminApi } from '@/services/admin'
import { errorMessage } from '@/services/api'
import { useScheduleStore } from '@/stores/schedule'
import { fromLocalInput, nextWeekStart, weekLabelFromStart } from '@/utils/week'

/** A new week: its dates, the week whose settings it starts with, and when booking opens. */
defineProps<{ cancellable: boolean }>()
const emit = defineEmits<{ created: [weekLabel: string]; cancel: [] }>()

const { t } = useI18n()
const schedule = useScheduleStore()
const { weeks, load, openWeek } = useAdminWeeks()

/** The week that stops another one from opening (a passed closing time doesn't count). */
const blockingWeek = computed(() =>
  openWeek.value && openWeek.value.status !== 'closed' ? openWeek.value : undefined,
)

const form = reactive({ startDate: '', weekLabel: '', open: false, opensAt: '', closesAt: '' })
/** Week whose slots, rules and capacity the new week starts with. */
const copyFromId = ref('')
const copyOptions = computed(() =>
  weeks.value.map((w) => ({
    value: w.id,
    label: t('common.week', { week: w.weekLabel }),
    hint: t('adminWeeks.students', { n: w.bookings }, w.bookings),
  })),
)
const creating = ref(false)
const error = ref('')

// Suggest the week after the latest one.
onMounted(() => {
  form.startDate = nextWeekStart(weeks.value[0])
  form.weekLabel = weekLabelFromStart(form.startDate)
  form.open = !blockingWeek.value
  copyFromId.value = weeks.value[0]?.id ?? ''
})

/** Picking the dates of a week that already exists. */
const labelTaken = computed(() => weeks.value.some((w) => w.weekLabel === form.weekLabel.trim()))
const windowError = computed(() => {
  const opens = fromLocalInput(form.opensAt)
  const closes = fromLocalInput(form.closesAt)
  return opens && closes && closes <= opens ? t('adminWeeks.windowInvalid') : ''
})

const validation = computed(() => {
  if (!form.weekLabel.trim()) return t('adminWeeks.labelRequired')
  if (labelTaken.value) return t('adminWeeks.labelTaken')
  if (form.open && blockingWeek.value) {
    return t('adminWeeks.onlyOneOpen', { week: blockingWeek.value.weekLabel })
  }
  return windowError.value
})

async function create() {
  error.value = validation.value
  if (error.value) return
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
        slots3: source.slots3,
        capacity: source.capacity,
      }),
      open: form.open,
      opensAt: form.open ? fromLocalInput(form.opensAt) : null,
      closesAt: form.open ? fromLocalInput(form.closesAt) : null,
    })
    schedule.setConfig(config)
    await load({ force: true })
    emit('created', week.weekLabel)
  } catch (e) {
    error.value = errorMessage(e, t('adminWeeks.createFailed'))
  } finally {
    creating.value = false
  }
}

const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300'
const hintClass = 'mt-1.5 text-xs text-zinc-500 dark:text-zinc-400'
const errorClass = 'mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400'
</script>

<template>
  <BaseCard solid>
    <form class="max-w-2xl space-y-5" novalidate @submit.prevent="create">
      <div>
        <h2 class="text-base font-semibold tracking-tight">{{ t('adminWeeks.newTitle') }}</h2>
        <p :class="hintClass">{{ t('adminWeeks.newIntro') }}</p>
      </div>

      <WeekDateField
        v-model:start-date="form.startDate"
        v-model:label="form.weekLabel"
        :error="labelTaken ? t('adminWeeks.labelTaken') : undefined"
      />

      <div v-if="weeks.length">
        <label for="w-copy" :class="labelClass">{{ t('adminWeeks.copyFrom') }}</label>
        <BaseSelect id="w-copy" v-model="copyFromId" :options="copyOptions" class="sm:max-w-80" />
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

      <div v-if="form.open" class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="w-opens" :class="labelClass">{{ t('adminWeeks.opensAt') }}</label>
          <DateTimeInput
            id="w-opens"
            v-model="form.opensAt"
            :placeholder="t('adminWeeks.opensAtPlaceholder')"
          />
          <p :class="hintClass">{{ t('adminWeeks.opensAtHint') }}</p>
        </div>
        <div>
          <label for="w-closes" :class="labelClass">{{ t('adminWeeks.closesAt') }}</label>
          <DateTimeInput
            id="w-closes"
            v-model="form.closesAt"
            :placeholder="t('adminWeeks.closesAtPlaceholder')"
            :invalid="!!windowError"
          />
          <p v-if="windowError" :class="errorClass">{{ windowError }}</p>
          <p v-else :class="hintClass">{{ t('adminWeeks.closesAtHint') }}</p>
        </div>
      </div>

      <BaseAlert v-if="error" tone="danger">{{ error }}</BaseAlert>

      <div class="flex flex-wrap gap-2">
        <BaseButton type="submit" :icon="CalendarPlus" :loading="creating">
          {{ t('adminWeeks.create') }}
        </BaseButton>
        <BaseButton v-if="cancellable" variant="secondary" @click="emit('cancel')">
          {{ t('common.cancel') }}
        </BaseButton>
      </div>
    </form>
  </BaseCard>
</template>
