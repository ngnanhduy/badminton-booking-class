<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarRange, ChevronDown } from '@lucide/vue'

import { useAdminWeeks } from '@/composables/useAdminWeeks'

/** Chooses which week an admin tab shows: the current week or any older one. */
const { t } = useI18n()
const { weeks, load, currentWeek, selectedWeek, selectWeek } = useAdminWeeks()

onMounted(() => load())

/** Keeps a week typed into the URL selectable even if it isn't in the list. */
const options = computed(() => {
  const list = weeks.value.map((w) => ({
    value: w.current ? '' : w.weekLabel,
    label: [
      t('common.week', { week: w.weekLabel }),
      w.open ? t('adminWeeks.badgeOpen') : w.current ? t('adminWeeks.badgeCurrent') : '',
      t('adminWeeks.students', { n: w.bookings }, w.bookings),
    ]
      .filter(Boolean)
      .join(' · '),
  }))
  if (selectedWeek.value && !weeks.value.some((w) => w.weekLabel === selectedWeek.value)) {
    list.push({ value: selectedWeek.value, label: selectedWeek.value })
  }
  if (!currentWeek.value) list.unshift({ value: '', label: t('adminWeeks.currentWeek') })
  return list
})

const value = computed({
  get: () =>
    selectedWeek.value === currentWeek.value?.weekLabel ? '' : (selectedWeek.value ?? ''),
  set: (week: string) => selectWeek(week || undefined),
})
</script>

<template>
  <label class="relative flex items-center">
    <span class="sr-only">{{ t('adminWeeks.pickerLabel') }}</span>
    <CalendarRange
      class="pointer-events-none absolute left-3 size-4 text-zinc-400"
      aria-hidden="true"
    />
    <select
      v-model="value"
      class="block h-10 w-full appearance-none truncate rounded-xl bg-white pr-8 pl-9 text-sm font-medium ring-1 ring-zinc-950/10 outline-none focus:ring-2 focus:ring-brand-500 dark:bg-zinc-950/40 dark:ring-white/10"
    >
      <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>
    <ChevronDown
      class="pointer-events-none absolute right-3 size-4 text-zinc-400"
      aria-hidden="true"
    />
  </label>
</template>
