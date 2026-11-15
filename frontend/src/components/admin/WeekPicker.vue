<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarRange } from '@lucide/vue'

import BaseSelect from '@/components/ui/BaseSelect.vue'
import type { SelectOption } from '@/types/ui'
import { useAdminWeeks } from '@/composables/useAdminWeeks'

/** Chooses which week an admin tab shows: the current week or any older one. */
const { t } = useI18n()
const { weeks, load, currentWeek, selectedWeek, selectWeek } = useAdminWeeks()

onMounted(() => load())

/** Keeps a week typed into the URL selectable even if it isn't in the list. */
const options = computed<SelectOption[]>(() => {
  const list: SelectOption[] = weeks.value.map((w) => ({
    value: w.current ? '' : w.weekLabel,
    label: t('common.week', { week: w.weekLabel }),
    hint: t('adminWeeks.students', { n: w.bookings }, w.bookings),
    ...(w.open
      ? { badge: t('adminWeeks.badgeOpen'), badgeTone: 'brand' as const }
      : w.current
        ? { badge: t('adminWeeks.badgeCurrent'), badgeTone: 'muted' as const }
        : {}),
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
  <BaseSelect
    v-model="value"
    :options="options"
    :icon="CalendarRange"
    :aria-label="t('adminWeeks.pickerLabel')"
    size="sm"
  />
</template>
