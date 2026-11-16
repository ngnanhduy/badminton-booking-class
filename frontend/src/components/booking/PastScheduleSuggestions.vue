<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { watchDebounced } from '@vueuse/core'
import { Check, History } from '@lucide/vue'

import { slotShort } from '@/i18n/format'
import { useBookingStore } from '@/stores/booking'
import { parseSlot } from '@/utils/slots'

/**
 * Offers the schedules a student booked in earlier weeks, found from the phone/email they
 * typed. Picking one fills steps 2 and 3; ignoring it leaves the form as it is.
 */
const { t } = useI18n()
const booking = useBookingStore()

// Look up the contact once the student stops typing.
watchDebounced(() => booking.form.contact, booking.loadHistory, { debounce: 500, immediate: true })

const options = computed(() =>
  booking.suggestions.map((past) => {
    const fit = booking.fitPastSchedule(past)
    const reasons = new Map(fit.unavailable.map((u) => [u.slot, u.reason]))
    const applied = booking.isApplied(past)
    return {
      past,
      slots: past.slots.map((value) => ({
        value,
        label: slotShort(parseSlot(value)),
        reason: reasons.get(value),
      })),
      usable: fit.slots.some(Boolean),
      applied,
      /** Filled in, but some sessions still need a slot. */
      incomplete: applied && fit.slots.some((slot) => !slot),
    }
  }),
)
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="opacity-0 -translate-y-1"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="opacity-0"
  >
    <section
      v-if="options.length"
      class="mt-5 rounded-xl bg-brand-50/70 p-4 ring-1 ring-brand-600/15 dark:bg-brand-400/5 dark:ring-brand-400/20"
      aria-labelledby="history-title"
      data-testid="past-schedules"
    >
      <div class="flex items-start gap-3">
        <History
          class="mt-0.5 size-4.5 shrink-0 text-brand-600 dark:text-brand-400"
          aria-hidden="true"
        />
        <div class="min-w-0">
          <h3 id="history-title" class="text-sm font-semibold text-zinc-900 dark:text-white">
            {{ t('history.title') }}
          </h3>
          <p class="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
            {{ t('history.description') }}
          </p>
        </div>
      </div>

      <ul class="mt-3 space-y-2">
        <li v-for="option in options" :key="option.past.weekLabel">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left ring-1 transition duration-150"
            :class="
              option.applied
                ? 'bg-white ring-2 ring-brand-600 dark:bg-zinc-900 dark:ring-brand-400'
                : option.usable
                  ? 'bg-white ring-zinc-950/10 hover:-translate-y-px hover:shadow-md hover:ring-brand-400 dark:bg-zinc-900 dark:ring-white/10 dark:hover:ring-brand-400/70'
                  : 'cursor-not-allowed bg-white/60 ring-zinc-950/5 dark:bg-white/[0.02] dark:ring-white/5'
            "
            :disabled="!option.usable"
            :aria-pressed="option.applied"
            :data-testid="`past-schedule-${option.past.weekLabel}`"
            @click="booking.applyPastSchedule(option.past)"
          >
            <span class="min-w-0 flex-1">
              <span class="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {{ t('history.week', { week: option.past.weekLabel }) }} ·
                {{ t('history.sessions', { n: option.past.count }, option.past.count) }}
              </span>
              <span class="mt-1.5 flex flex-wrap gap-1.5">
                <span
                  v-for="slot in option.slots"
                  :key="slot.value"
                  class="rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums"
                  :class="
                    slot.reason
                      ? 'bg-zinc-100 text-zinc-400 line-through dark:bg-white/5 dark:text-zinc-500'
                      : 'bg-brand-600/10 text-brand-800 dark:bg-brand-400/10 dark:text-brand-200'
                  "
                >
                  {{ slot.label }}
                </span>
              </span>
              <span
                v-for="slot in option.slots.filter((s) => s.reason)"
                :key="`why-${slot.value}`"
                class="mt-1.5 block text-xs text-amber-700 dark:text-amber-400"
              >
                {{ slot.label }} {{ t(`history.reason.${slot.reason}`) }}
              </span>
            </span>
            <span
              class="flex shrink-0 items-center gap-1 text-sm font-semibold"
              :class="
                option.usable
                  ? 'text-brand-700 dark:text-brand-300'
                  : 'text-zinc-400 dark:text-zinc-500'
              "
            >
              <template v-if="option.applied">
                <Check class="size-4" stroke-width="3" aria-hidden="true" />
                {{ t('history.selected') }}
              </template>
              <template v-else>
                {{ option.usable ? t('history.use') : t('history.unusable') }}
              </template>
            </span>
          </button>
          <p
            v-if="option.incomplete"
            class="mt-1.5 px-1 text-xs font-medium text-amber-700 dark:text-amber-400"
            role="status"
          >
            {{ t('history.pickRest') }}
          </p>
        </li>
      </ul>

      <button
        type="button"
        class="mt-3 text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
        @click="booking.dismissHistory()"
      >
        {{ t('history.dismiss') }}
      </button>
    </section>
  </Transition>
</template>
