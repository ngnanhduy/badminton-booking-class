<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Send } from '@lucide/vue'

import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import { dayName, timeRange } from '@/i18n/format'
import { useBookingStore } from '@/stores/booking'
import { useScheduleStore } from '@/stores/schedule'
import { maskContact } from '@/utils/contact'
import { parseSlot } from '@/utils/slots'
import { slotDate } from '@/utils/week'

const { t } = useI18n()
const booking = useBookingStore()
const schedule = useScheduleStore()

const rows = computed(() =>
  booking.selectedSlots.map(({ index, slot }) => {
    const parsed = slot ? parseSlot(slot) : null
    const date = parsed ? slotDate(schedule.config?.weekLabel ?? '', parsed.dayIndex) : ''
    return {
      key: index,
      label: t('common.session', { n: index + 1 }),
      value: parsed ? `${dayName(parsed)}${date ? ` (${date})` : ''}, ${timeRange(parsed)}` : '',
    }
  }),
)

const name = computed(() => booking.form.zaloName.trim())
const contact = computed(() =>
  booking.form.contact.trim() ? maskContact(booking.form.contact) : '',
)
const makeup = computed(() => booking.form.makeup.trim())
</script>

<template>
  <BaseCard aria-labelledby="summary-title">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 id="summary-title" class="text-base font-semibold tracking-tight">
          {{ booking.editing ? t('summary.titleEditing') : t('summary.title') }}
        </h2>
        <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {{ t('common.week', { week: schedule.config?.weekLabel ?? '' }) }}
        </p>
      </div>
      <span
        v-if="booking.form.count"
        class="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 tabular-nums dark:bg-white/10 dark:text-zinc-200"
      >
        {{ t('summary.progress', { done: booking.selectedCount, total: booking.form.count }) }}
      </span>
    </div>

    <div
      class="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10"
      role="progressbar"
      :aria-label="t('summary.progressLabel')"
      :aria-valuenow="Math.round(booking.progress * 100)"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div
        class="h-full rounded-full bg-linear-to-r from-brand-500 to-lime-400 transition-[width] duration-500 ease-out"
        :style="{ width: `${booking.progress * 100}%` }"
      />
    </div>

    <dl class="mt-4 divide-y divide-zinc-950/5 text-sm dark:divide-white/[0.07]">
      <div class="flex items-center justify-between gap-4 py-2.5">
        <dt class="shrink-0 text-zinc-500 dark:text-zinc-400">{{ t('common.zaloName') }}</dt>
        <dd class="truncate font-medium" :class="!name && 'text-zinc-400 dark:text-zinc-500'">
          {{ name || t('common.notEntered') }}
        </dd>
      </div>
      <div class="flex items-center justify-between gap-4 py-2.5">
        <dt class="shrink-0 text-zinc-500 dark:text-zinc-400">{{ t('common.contact') }}</dt>
        <dd class="truncate font-medium" :class="!contact && 'text-zinc-400 dark:text-zinc-500'">
          {{ contact || t('common.notEntered') }}
        </dd>
      </div>
      <template v-if="booking.form.count">
        <div v-for="row in rows" :key="row.key" class="flex justify-between gap-4 py-2.5">
          <dt class="shrink-0 text-zinc-500 dark:text-zinc-400">{{ row.label }}</dt>
          <dd
            class="text-right"
            :class="row.value ? 'font-medium' : 'text-zinc-400 dark:text-zinc-500'"
          >
            {{ row.value || t('common.notChosen') }}
          </dd>
        </div>
      </template>
      <div v-else class="flex justify-between gap-4 py-2.5">
        <dt class="text-zinc-500 dark:text-zinc-400">{{ t('common.sessionCount') }}</dt>
        <dd class="text-zinc-400 dark:text-zinc-500">{{ t('common.notChosen') }}</dd>
      </div>
      <div v-if="makeup" class="flex justify-between gap-4 py-2.5">
        <dt class="shrink-0 text-zinc-500 dark:text-zinc-400">{{ t('common.makeup') }}</dt>
        <dd class="line-clamp-2 text-right font-medium break-words">{{ makeup }}</dd>
      </div>
    </dl>

    <BaseAlert v-if="booking.submitError" tone="danger" class="mt-4">
      {{ booking.submitError }}
    </BaseAlert>

    <BaseButton
      type="submit"
      form="booking-form"
      size="lg"
      block
      class="mt-5"
      :loading="booking.submitting"
      :icon-right="Send"
    >
      {{
        booking.submitting
          ? t('summary.sending')
          : booking.editing
            ? t('summary.save')
            : t('summary.submit')
      }}
    </BaseButton>
  </BaseCard>
</template>
