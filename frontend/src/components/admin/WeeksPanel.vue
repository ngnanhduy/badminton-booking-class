<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import WeekCreateForm from '@/components/admin/WeekCreateForm.vue'
import WeekList from '@/components/admin/WeekList.vue'
import WeekOpeningForm from '@/components/admin/WeekOpeningForm.vue'
import { useAdminWeeks } from '@/composables/useAdminWeeks'

/**
 * Opening and closing weeks: the list of weeks on the side, and the chosen week's dates and
 * booking window (or the form for a new week) next to it.
 */
const emit = defineEmits<{ editSchedule: [] }>()

const { t } = useI18n()
const { weeks, loading, error, selectWeek } = useAdminWeeks()

const creating = ref(false)
/** Message shown above a week that was just created. */
const notice = ref('')

/** Without any week there is nothing to edit: show the form for the first one. */
const showCreate = computed(
  () => creating.value || (!weeks.value.length && !loading.value && !error.value),
)

function startCreate() {
  creating.value = true
  notice.value = ''
}

function onCreated(weekLabel: string) {
  creating.value = false
  selectWeek(weekLabel)
  notice.value = t('adminWeeks.created', { week: weekLabel })
}
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:items-start">
    <WeekList
      class="lg:sticky lg:top-20"
      :creating="showCreate"
      @create="startCreate"
      @select="creating = false"
    />
    <WeekCreateForm
      v-if="showCreate"
      :cancellable="!!weeks.length"
      @created="onCreated"
      @cancel="creating = false"
    />
    <WeekOpeningForm
      v-else
      :notice="notice"
      @dismiss-notice="notice = ''"
      @edit-schedule="emit('editSchedule')"
    />
  </div>
</template>
