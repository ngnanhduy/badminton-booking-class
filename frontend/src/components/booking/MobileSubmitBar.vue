<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Send } from '@lucide/vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import { useBookingStore } from '@/stores/booking'

const { t } = useI18n()
const booking = useBookingStore()
</script>

<template>
  <div
    class="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-950/5 bg-white/85 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden dark:border-white/10 dark:bg-zinc-950/85"
  >
    <div class="mx-auto flex max-w-2xl items-center gap-4">
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold">
          <template v-if="booking.form.count">
            {{
              t('summary.mobileProgress', {
                done: booking.selectedCount,
                total: booking.form.count,
              })
            }}
          </template>
          <template v-else>{{ t('summary.mobileNoCount') }}</template>
        </p>
        <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10">
          <div
            class="h-full rounded-full bg-linear-to-r from-brand-500 to-lime-400 transition-[width] duration-500 ease-out"
            :style="{ width: `${booking.progress * 100}%` }"
          />
        </div>
      </div>
      <BaseButton
        type="submit"
        form="booking-form"
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
    </div>
  </div>
</template>
