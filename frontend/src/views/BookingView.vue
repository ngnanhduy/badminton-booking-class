<script setup lang="ts">
import { onMounted } from 'vue'
import { CalendarDays, Lock, RefreshCw, WifiOff } from '@lucide/vue'

import BookingForm from '@/components/booking/BookingForm.vue'
import BookingHero from '@/components/booking/BookingHero.vue'
import BookingSkeleton from '@/components/booking/BookingSkeleton.vue'
import BookingSuccess from '@/components/booking/BookingSuccess.vue'
import BookingSummary from '@/components/booking/BookingSummary.vue'
import MobileSubmitBar from '@/components/booking/MobileSubmitBar.vue'
import RulesCard from '@/components/booking/RulesCard.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { appConfig } from '@/config/app'
import { useBookingStore } from '@/stores/booking'
import { useScheduleStore } from '@/stores/schedule'

const schedule = useScheduleStore()
const booking = useBookingStore()

onMounted(() => schedule.load())

function startOver() {
  booking.reset()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 pt-10 pb-36 sm:px-6 sm:pt-14 lg:pb-20">
    <BaseAlert
      v-if="appConfig.demoMode"
      tone="warning"
      :title="$t('booking.demoTitle')"
      class="mb-8 animate-fade-in-up"
    >
      <i18n-t keypath="booking.demoBody" scope="global">
        <template #flag>
          <code class="rounded bg-amber-100 px-1 py-0.5 text-xs font-semibold dark:bg-amber-400/15"
            >VITE_DEMO=true</code
          >
        </template>
      </i18n-t>
    </BaseAlert>

    <BaseAlert
      v-if="booking.editing && !booking.result"
      tone="info"
      :title="$t('booking.editingTitle')"
      class="mb-8 animate-fade-in-up"
    >
      <i18n-t keypath="booking.editingBody" scope="global">
        <template #save>
          <strong>{{ $t('summary.save') }}</strong>
        </template>
      </i18n-t>
      <button
        type="button"
        class="ml-1 font-semibold underline underline-offset-4"
        @click="startOver"
      >
        {{ $t('booking.cancelEditing') }}
      </button>
    </BaseAlert>

    <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end xl:gap-10">
      <BookingHero :config="schedule.config" />
      <RulesCard v-if="schedule.config" :rules="schedule.config.rules" />
      <div
        v-else-if="schedule.status !== 'error'"
        class="hidden h-52 animate-pulse rounded-2xl bg-white/60 ring-1 ring-zinc-950/5 lg:block dark:bg-zinc-900/50 dark:ring-white/10"
        aria-hidden="true"
      />
    </div>

    <div class="mt-10">
      <Transition
        mode="out-in"
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="opacity-0 translate-y-2"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="opacity-0"
      >
        <BaseCard v-if="schedule.status === 'error'" key="error">
          <EmptyState
            :icon="WifiOff"
            tone="danger"
            :title="$t('common.scheduleLoadFailed')"
            :description="schedule.error"
          >
            <BaseButton :icon="RefreshCw" @click="schedule.load({ force: true })">
              {{ $t('common.retry') }}
            </BaseButton>
          </EmptyState>
        </BaseCard>

        <BookingSkeleton v-else-if="!schedule.config" key="loading" />

        <BaseCard v-else-if="!schedule.config.open" key="closed">
          <EmptyState
            :icon="Lock"
            :title="$t('booking.closedTitle')"
            :description="$t('booking.closedBody')"
          >
            <BaseButton :to="{ name: 'schedule' }" variant="secondary" :icon="CalendarDays">
              {{ $t('common.viewSchedule') }}
            </BaseButton>
          </EmptyState>
        </BaseCard>

        <BookingSuccess
          v-else-if="booking.result"
          key="success"
          :result="booking.result"
          @edit="booking.edit"
          @reset="startOver"
        />

        <div
          v-else
          key="form"
          class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start xl:gap-10"
        >
          <BookingForm />
          <aside class="hidden lg:sticky lg:top-24 lg:block">
            <BookingSummary />
          </aside>
        </div>
      </Transition>
    </div>

    <MobileSubmitBar v-if="schedule.config?.open && !booking.result" />
  </div>
</template>
