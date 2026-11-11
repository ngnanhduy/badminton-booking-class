<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarDays, Gauge, Users } from '@lucide/vue'

import type { ScheduleConfig } from '@/types/booking'
import { mergeSlots } from '@/utils/slots'

const props = defineProps<{ config: ScheduleConfig | null }>()
const { t } = useI18n()

const stats = computed(() => {
  const c = props.config
  if (!c) return []
  const slots = mergeSlots(c.slots1, c.slots2).length
  return [
    { icon: Users, value: c.totalBookings, label: t('hero.students', c.totalBookings) },
    { icon: CalendarDays, value: slots, label: t('hero.slots', slots) },
    ...(c.capacity ? [{ icon: Gauge, value: c.capacity, label: t('hero.capacity') }] : []),
  ]
})
</script>

<template>
  <div class="animate-fade-in-up">
    <div v-if="config" class="flex flex-wrap items-center gap-2">
      <span
        class="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-zinc-700 shadow-xs ring-1 ring-zinc-950/[0.06] dark:bg-white/5 dark:text-zinc-200 dark:ring-white/10"
      >
        <span class="relative flex size-2" aria-hidden="true">
          <span
            v-if="config.open"
            class="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-75"
          />
          <span
            class="relative inline-flex size-2 rounded-full"
            :class="config.open ? 'bg-brand-500' : 'bg-zinc-400'"
          />
        </span>
        {{ config.open ? t('hero.open') : t('hero.closed') }}
      </span>
      <span
        class="inline-flex items-center rounded-full bg-brand-600/10 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-600/15 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20"
      >
        {{ t('common.week', { week: config.weekLabel }) }}
      </span>
    </div>
    <div v-else class="flex gap-2" aria-hidden="true">
      <div class="h-6 w-36 animate-pulse rounded-full bg-zinc-200/80 dark:bg-white/10" />
      <div class="h-6 w-28 animate-pulse rounded-full bg-zinc-200/80 dark:bg-white/10" />
    </div>

    <h1
      class="mt-5 text-4xl font-extrabold tracking-tight text-balance text-zinc-950 sm:text-5xl dark:text-white"
    >
      {{ t('hero.title') }}
      <span
        class="bg-linear-to-r from-brand-600 via-brand-500 to-lime-500 bg-clip-text text-transparent dark:from-brand-400 dark:to-lime-300"
      >
        {{ t('hero.titleAccent') }}
      </span>
    </h1>
    <i18n-t
      keypath="hero.intro"
      tag="p"
      class="mt-4 max-w-xl text-base leading-relaxed text-pretty text-zinc-600 dark:text-zinc-400"
      scope="global"
    >
      <template #link>
        <RouterLink
          :to="{ name: 'edit' }"
          class="font-semibold text-brand-700 underline decoration-brand-500/40 underline-offset-4 hover:decoration-brand-500 dark:text-brand-300"
          >{{ t('hero.introLink') }}</RouterLink
        >
      </template>
    </i18n-t>

    <dl v-if="stats.length" class="mt-7 flex flex-wrap gap-x-6 gap-y-3">
      <div v-for="stat in stats" :key="stat.label" class="flex items-center gap-2.5">
        <dt class="sr-only">{{ stat.label }}</dt>
        <component
          :is="stat.icon"
          class="size-4.5 text-brand-600 dark:text-brand-400"
          aria-hidden="true"
        />
        <dd class="text-sm text-zinc-600 dark:text-zinc-400">
          <span class="font-bold text-zinc-900 tabular-nums dark:text-white">{{ stat.value }}</span>
          {{ stat.label }}
        </dd>
      </div>
    </dl>
  </div>
</template>
