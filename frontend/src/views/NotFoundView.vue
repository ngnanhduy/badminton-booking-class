<script setup lang="ts">
import { ArrowLeft, CalendarDays } from '@lucide/vue'

import BaseButton from '@/components/ui/BaseButton.vue'
</script>

<template>
  <div class="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center sm:px-6">
    <p
      class="animate-fade-in-up bg-linear-to-br from-brand-500 to-lime-400 bg-clip-text text-8xl font-extrabold tracking-tighter text-transparent"
    >
      404
    </p>
    <h1 class="mt-4 text-2xl font-bold tracking-tight">{{ $t('notFound.title') }}</h1>
    <p class="mt-2 max-w-sm text-zinc-600 dark:text-zinc-400">{{ $t('notFound.body') }}</p>
    <div class="mt-8 flex flex-wrap justify-center gap-2">
      <BaseButton :to="{ name: 'booking' }" :icon="ArrowLeft">
        {{ $t('common.backToBooking') }}
      </BaseButton>
      <BaseButton :to="{ name: 'schedule' }" variant="secondary" :icon="CalendarDays">
        {{ $t('common.viewSchedule') }}
      </BaseButton>
    </div>
  </div>
</template>
