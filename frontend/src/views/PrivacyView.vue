<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarClock, LockKeyhole } from '@lucide/vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import { useClubName } from '@/composables/useClubName'
import { useScheduleStore } from '@/stores/schedule'

const { t, tm, rt } = useI18n()
const schedule = useScheduleStore()
const clubName = useClubName()
onMounted(() => schedule.load())

const privacy = computed(() => schedule.config?.privacy)

/** The notice lives in the locale files (privacy.sections); values are filled in here. */
const sections = computed(() => {
  const params = {
    controller: privacy.value?.controllerName || clubName.value,
    days: privacy.value?.retentionDays ?? 180,
    contactLine: privacy.value?.controllerContact
      ? t('privacy.contactWith', { contact: privacy.value.controllerContact })
      : t('privacy.contactFallback'),
  }
  const raw = tm('privacy.sections') as unknown as { title: unknown; body: unknown[] }[]
  return raw.map((section) => ({
    title: rt(section.title as Parameters<typeof rt>[0]),
    body: section.body.map((line) => rt(line as Parameters<typeof rt>[0], params)),
  }))
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
    <div class="mx-auto max-w-3xl animate-fade-in-up">
      <span
        class="inline-flex items-center gap-1.5 rounded-full bg-brand-600/10 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-600/15 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20"
      >
        <LockKeyhole class="size-3.5" aria-hidden="true" />
        {{ t('privacy.version', { version: privacy?.policyVersion ?? '—' }) }}
      </span>
      <h1
        class="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl dark:text-white"
      >
        {{ t('titles.privacy') }}
      </h1>
      <p class="mt-3 leading-relaxed text-zinc-600 dark:text-zinc-400">{{ t('privacy.intro') }}</p>

      <BaseCard class="mt-8 space-y-7">
        <section v-for="section in sections" :key="section.title">
          <h2 class="text-base font-semibold tracking-tight">{{ section.title }}</h2>
          <ul class="mt-2 space-y-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            <li v-for="line in section.body" :key="line" class="flex gap-2.5">
              <span class="mt-2 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
              <span>{{ line }}</span>
            </li>
          </ul>
        </section>
      </BaseCard>

      <div class="mt-6 flex flex-wrap gap-2">
        <BaseButton :to="{ name: 'edit' }" :icon="CalendarClock">
          {{ t('privacy.manage') }}
        </BaseButton>
        <BaseButton :to="{ name: 'booking' }" variant="secondary">
          {{ t('common.backToBooking') }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
