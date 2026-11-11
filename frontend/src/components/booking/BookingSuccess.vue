<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowRight, Check, Pencil, UserPlus } from '@lucide/vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import type { BookingResult } from '@/types/booking'
import { maskContact } from '@/utils/contact'
import BookedSessionList from './BookedSessionList.vue'

const props = defineProps<{ result: BookingResult }>()
const emit = defineEmits<{ edit: []; reset: [] }>()
const { t } = useI18n()

const maskedContact = computed(() => maskContact(props.result.contact))
</script>

<template>
  <BaseCard class="mx-auto max-w-xl animate-fade-in-up text-center" :padded="false">
    <div class="px-6 pt-10 pb-8 sm:px-10">
      <div class="relative mx-auto grid size-16 place-items-center">
        <span
          class="absolute inset-0 animate-ping rounded-full bg-brand-400/30 [animation-iteration-count:2]"
          aria-hidden="true"
        />
        <span
          class="relative grid size-16 animate-pop place-items-center rounded-full bg-linear-to-br from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-600/30"
        >
          <Check class="size-8" stroke-width="3" aria-hidden="true" />
        </span>
      </div>

      <h2 class="mt-6 text-2xl font-bold tracking-tight text-balance">
        {{ result.updated ? t('success.updated') : t('success.created') }}
      </h2>
      <i18n-t
        keypath="success.thanks"
        tag="p"
        class="mt-2 text-zinc-600 dark:text-zinc-400"
        scope="global"
      >
        <template #name>
          <strong class="font-semibold text-zinc-900 dark:text-white">{{ result.zaloName }}</strong>
        </template>
        <template #week>{{ result.weekLabel }}</template>
      </i18n-t>

      <BookedSessionList
        class="mt-6"
        :slots="result.slots"
        :week-label="result.weekLabel"
        :makeup="result.makeup"
      />

      <i18n-t
        keypath="success.changeLater"
        tag="p"
        class="mt-5 text-xs text-zinc-500 dark:text-zinc-400"
        scope="global"
      >
        <template #edit>
          <strong class="font-semibold">{{ t('nav.edit') }}</strong>
        </template>
        <template #contact>{{ maskedContact }}</template>
      </i18n-t>
    </div>

    <div
      class="flex flex-col-reverse gap-2 border-t border-zinc-950/5 bg-zinc-50/60 px-6 py-4 sm:flex-row sm:justify-center sm:px-10 dark:border-white/[0.07] dark:bg-white/[0.02]"
    >
      <BaseButton variant="ghost" :icon="UserPlus" @click="emit('reset')">
        {{ t('success.bookAnother') }}
      </BaseButton>
      <BaseButton variant="secondary" :icon="Pencil" @click="emit('edit')">
        {{ t('success.edit') }}
      </BaseButton>
      <BaseButton :to="{ name: 'schedule' }" :icon-right="ArrowRight">
        {{ t('common.viewSchedule') }}
      </BaseButton>
    </div>
  </BaseCard>
</template>
