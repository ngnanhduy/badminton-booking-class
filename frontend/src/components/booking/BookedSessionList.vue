<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Repeat } from '@lucide/vue'

import { dayName, timeRange } from '@/i18n/format'
import { parseSlot } from '@/utils/slots'
import { slotDate } from '@/utils/week'

const props = defineProps<{ slots: string[]; weekLabel: string; makeup?: string }>()
const { t } = useI18n()

const sessions = computed(() =>
  props.slots.map((value, index) => {
    const slot = parseSlot(value)
    return {
      index,
      day: dayName(slot),
      dayShort: dayName(slot, 'short'),
      time: timeRange(slot),
      date: slotDate(props.weekLabel, slot.dayIndex),
    }
  }),
)
</script>

<template>
  <div class="text-left">
    <ul class="space-y-2">
      <li
        v-for="session in sessions"
        :key="session.index"
        class="flex items-center gap-3 rounded-xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-950/5 dark:bg-white/[0.03] dark:ring-white/10"
      >
        <span
          class="grid size-11 shrink-0 place-items-center rounded-lg bg-white text-center leading-tight ring-1 ring-zinc-950/10 dark:bg-white/10 dark:ring-white/10"
        >
          <span class="text-xs font-bold text-brand-700 dark:text-brand-300">
            {{ session.dayShort }}
          </span>
          <span
            v-if="session.date"
            class="-mt-1 text-[0.625rem] font-medium text-zinc-500 dark:text-zinc-400"
          >
            {{ session.date }}
          </span>
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {{ t('common.session', { n: session.index + 1 }) }}
          </span>
          <span class="block font-semibold">
            {{ session.day }}<template v-if="session.date">, {{ session.date }}</template> ·
            {{ session.time }}
          </span>
        </span>
      </li>
    </ul>

    <div
      v-if="makeup"
      class="mt-3 flex gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200/70 dark:bg-amber-400/10 dark:text-amber-100 dark:ring-amber-400/20"
    >
      <Repeat class="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
      <p>
        <span class="font-semibold">{{ t('common.makeup') }}:</span> {{ makeup }}
      </p>
    </div>
  </div>
</template>
