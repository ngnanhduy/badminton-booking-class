<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Save } from '@lucide/vue'

import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { adminApi } from '@/services/admin'
import { errorMessage } from '@/services/api'
import { useScheduleStore } from '@/stores/schedule'
import type { ScheduleConfig } from '@/types/booking'

const { t } = useI18n()
const schedule = useScheduleStore()

const form = reactive({
  weekLabel: '',
  open: true,
  capacity: '',
  rules: '',
  slots1: '',
  slots2: '',
})
const saving = ref(false)
const error = ref('')
const saved = ref(false)

function fill(config: ScheduleConfig) {
  form.weekLabel = config.weekLabel
  form.open = config.open
  form.capacity = config.capacity ? String(config.capacity) : ''
  form.rules = config.rules.join('\n')
  form.slots1 = config.slots1.join('\n')
  form.slots2 = config.slots2.join('\n')
}

// Fill once the schedule is available; later refreshes don't overwrite unsaved edits.
const stop = watch(
  () => schedule.config,
  (config) => {
    if (!config) return
    fill(config)
    queueMicrotask(() => stop())
  },
  { immediate: true },
)

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

const capacityError = computed(() => {
  if (!form.capacity.trim()) return ''
  const n = Number(form.capacity)
  return Number.isInteger(n) && n > 0 ? '' : t('adminSettings.capacityError')
})
const weekChanged = computed(
  () => !!schedule.config && form.weekLabel.trim() !== schedule.config.weekLabel,
)

async function save() {
  error.value = ''
  saved.value = false
  if (capacityError.value) return
  if (!form.weekLabel.trim() || !lines(form.slots1).length || !lines(form.slots2).length) {
    error.value = t('adminSettings.required')
    return
  }
  saving.value = true
  try {
    const config = await adminApi.updateSettings({
      weekLabel: form.weekLabel.trim(),
      open: form.open,
      capacity: form.capacity.trim() ? Number(form.capacity) : null,
      rules: lines(form.rules),
      slots1: lines(form.slots1),
      slots2: lines(form.slots2),
    })
    schedule.setConfig(config)
    fill(config)
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
</script>

<template>
  <form
    class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
    novalidate
    @submit.prevent="save"
  >
    <BaseCard class="space-y-5" solid>
      <h2 class="text-base font-semibold tracking-tight">{{ t('adminSettings.weekSection') }}</h2>
      <div>
        <label for="s-week" :class="labelClass">{{ t('adminSettings.weekLabel') }}</label>
        <input
          id="s-week"
          v-model="form.weekLabel"
          maxlength="50"
          :placeholder="t('adminSettings.weekPlaceholder')"
          :class="[inputClass, 'h-11']"
        />
        <p v-if="weekChanged" class="mt-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          {{ t('adminSettings.weekChanged') }}
        </p>
        <p v-else :class="hintClass">{{ t('adminSettings.weekHint') }}</p>
      </div>
      <BaseSwitch
        v-model="form.open"
        :label="t('adminSettings.open')"
        :description="t('adminSettings.openHint')"
      />
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
        <p v-if="capacityError" class="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
          {{ capacityError }}
        </p>
        <p v-else :class="hintClass">{{ t('adminSettings.capacityHint') }}</p>
      </div>
      <div>
        <label for="s-rules" :class="labelClass">{{ t('adminSettings.rules') }}</label>
        <textarea id="s-rules" v-model="form.rules" rows="5" :class="[inputClass, 'py-2.5']" />
        <p :class="hintClass">{{ t('adminSettings.rulesHint') }}</p>
      </div>
    </BaseCard>

    <BaseCard class="space-y-5" solid>
      <h2 class="text-base font-semibold tracking-tight">{{ t('adminSettings.slotsSection') }}</h2>
      <div>
        <label for="s-slots1" :class="labelClass">{{ t('adminSettings.slots1') }}</label>
        <textarea
          id="s-slots1"
          v-model="form.slots1"
          rows="7"
          :class="[inputClass, 'py-2.5 font-mono text-[0.8125rem]']"
        />
      </div>
      <div>
        <label for="s-slots2" :class="labelClass">{{ t('adminSettings.slots2') }}</label>
        <textarea
          id="s-slots2"
          v-model="form.slots2"
          rows="7"
          :class="[inputClass, 'py-2.5 font-mono text-[0.8125rem]']"
        />
        <i18n-t keypath="adminSettings.slotsHint" tag="p" :class="hintClass" scope="global">
          <template #example><code>Thứ 2 18h - 20h</code></template>
        </i18n-t>
      </div>
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
</template>
