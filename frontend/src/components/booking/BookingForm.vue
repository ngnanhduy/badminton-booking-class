<script setup lang="ts">
import { computed, nextTick, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { AtSign, CalendarRange, LockKeyhole, UserRound } from '@lucide/vue'

import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import { useBookingStore } from '@/stores/booking'
import { useScheduleStore } from '@/stores/schedule'
import { MAX_MAKEUP_LENGTH, MAX_NAME_LENGTH } from '@/utils/validation'
import FormStep from './FormStep.vue'
import SessionCountPicker from './SessionCountPicker.vue'
import SessionTabs from './SessionTabs.vue'
import SlotPicker from './SlotPicker.vue'

const { t } = useI18n()
const booking = useBookingStore()
const schedule = useScheduleStore()
const formEl = useTemplateRef<HTMLFormElement>('formEl')

const SESSION_INDEXES = [0, 1, 2] as const

function slotError(index: number) {
  return booking.errors[`slot${index}` as 'slot0' | 'slot1' | 'slot2']
}

const nameError = computed(() => (booking.showErrors ? booking.errors.zaloName : undefined))
const contactError = computed(() => (booking.showErrors ? booking.errors.contact : undefined))
const consentError = computed(() =>
  booking.showErrors && !booking.form.consent ? t('validation.consentRequired') : undefined,
)
const privacy = computed(() => schedule.config?.privacy)
const countError = computed(() => (booking.showErrors ? booking.errors.count : undefined))
const activeSlotError = computed(() =>
  booking.showErrors ? slotError(booking.activeSession) : undefined,
)
const invalidSessions = computed(() =>
  booking.showErrors ? SESSION_INDEXES.filter((i) => slotError(i)) : [],
)
const slotsComplete = computed(
  () =>
    !!booking.form.count &&
    booking.selectedCount === booking.form.count &&
    SESSION_INDEXES.every((i) => !slotError(i)),
)

const activeDays = computed(() => schedule.daysForSession(booking.activeSession))

/** Slots used by the other sessions, so they can't be picked twice. */
const takenBy = computed(() => {
  const map: Record<string, number> = {}
  booking.form.slots.forEach((slot, index) => {
    if (slot && index !== booking.activeSession && index < (booking.form.count ?? 0)) {
      map[slot] = index + 1
    }
  })
  return map
})

async function onSubmit() {
  const ok = await booking.submit()
  if (ok) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }

  // Bring the first problem into view (switching to the session tab that needs a slot).
  const firstInvalidSession = SESSION_INDEXES.find((i) => slotError(i))
  const step1Ok = !booking.errors.zaloName && !booking.errors.contact
  if (step1Ok && !booking.errors.count && firstInvalidSession !== undefined) {
    booking.activeSession = firstInvalidSession
  }
  await nextTick()
  formEl.value
    ?.querySelector<HTMLElement>('[data-invalid="true"]')
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
</script>

<template>
  <form id="booking-form" ref="formEl" novalidate class="space-y-5" @submit.prevent="onSubmit">
    <!-- 1. Name -->
    <FormStep
      :step="1"
      heading-id="step-name"
      :title="t('form.step1Title')"
      :description="t('form.step1Description')"
      :complete="!booking.errors.zaloName && !booking.errors.contact"
    >
      <label
        for="zalo-name"
        class="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {{ t('common.zaloName') }} <span class="text-rose-500">*</span>
      </label>
      <div class="relative" :data-invalid="!!nameError">
        <UserRound
          class="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-zinc-400"
          aria-hidden="true"
        />
        <input
          id="zalo-name"
          v-model="booking.form.zaloName"
          type="text"
          name="zaloName"
          autocomplete="nickname"
          enterkeyhint="next"
          :maxlength="MAX_NAME_LENGTH"
          :placeholder="t('form.namePlaceholder')"
          :aria-invalid="!!nameError"
          :aria-describedby="nameError ? 'zalo-name-error' : 'zalo-name-hint'"
          class="block h-12 w-full rounded-xl bg-white pr-4 pl-10 text-base text-zinc-900 ring-1 transition outline-none placeholder:text-zinc-400 focus:ring-2 dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-zinc-500"
          :class="
            nameError
              ? 'ring-rose-400 focus:ring-rose-500 dark:ring-rose-500/60'
              : 'ring-zinc-950/10 focus:ring-brand-500 dark:ring-white/10 dark:focus:ring-brand-400'
          "
        />
      </div>
      <p
        v-if="nameError"
        id="zalo-name-error"
        class="mt-2 text-sm font-medium text-rose-600 dark:text-rose-400"
      >
        {{ nameError }}
      </p>
      <span v-else id="zalo-name-hint" class="sr-only">{{ t('form.nameHint') }}</span>

      <label
        for="contact"
        class="mt-5 mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {{ t('form.contactLabel') }} <span class="text-rose-500">*</span>
      </label>
      <div class="relative" :data-invalid="!!contactError">
        <AtSign
          class="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-zinc-400"
          aria-hidden="true"
        />
        <input
          id="contact"
          v-model="booking.form.contact"
          type="text"
          name="contact"
          autocomplete="off"
          spellcheck="false"
          maxlength="254"
          :placeholder="t('form.contactPlaceholder')"
          :readonly="booking.editing"
          :aria-invalid="!!contactError"
          :aria-describedby="contactError ? 'contact-error' : 'contact-hint'"
          class="block h-12 w-full rounded-xl bg-white pr-10 pl-10 text-base text-zinc-900 ring-1 transition outline-none placeholder:text-zinc-400 read-only:bg-zinc-50 read-only:text-zinc-500 focus:ring-2 dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-zinc-500 dark:read-only:bg-white/5 dark:read-only:text-zinc-400"
          :class="
            contactError
              ? 'ring-rose-400 focus:ring-rose-500 dark:ring-rose-500/60'
              : 'ring-zinc-950/10 focus:ring-brand-500 dark:ring-white/10 dark:focus:ring-brand-400'
          "
        />
        <LockKeyhole
          class="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-brand-600 dark:text-brand-400"
          aria-hidden="true"
        />
      </div>
      <p
        v-if="contactError"
        id="contact-error"
        class="mt-2 text-sm font-medium text-rose-600 dark:text-rose-400"
      >
        {{ contactError }}
      </p>
      <p v-else id="contact-hint" class="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        {{ booking.editing ? t('form.contactHintEditing') : t('form.contactHint') }}
      </p>
    </FormStep>

    <!-- 2. Number of sessions -->
    <FormStep
      :step="2"
      heading-id="step-count"
      :title="t('form.step2Title')"
      :description="t('form.step2Description')"
      :complete="!!booking.form.count"
    >
      <div :data-invalid="!!countError">
        <SessionCountPicker
          v-model="booking.form.count"
          :invalid="!!countError"
          :described-by="countError ? 'count-error' : undefined"
        />
      </div>
      <p
        v-if="countError"
        id="count-error"
        class="mt-2 text-sm font-medium text-rose-600 dark:text-rose-400"
      >
        {{ countError }}
      </p>
    </FormStep>

    <!-- 3. Slots -->
    <FormStep
      :step="3"
      heading-id="step-slots"
      :title="t('form.step3Title')"
      :description="t('form.step3Description')"
      :complete="slotsComplete"
    >
      <div
        v-if="!booking.form.count"
        class="flex flex-col items-center rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-white/15 dark:text-zinc-400"
      >
        <CalendarRange class="mb-2 size-6 text-zinc-400" aria-hidden="true" />
        {{ t('form.pickCountFirst') }}
      </div>

      <template v-else>
        <SessionTabs
          v-model="booking.activeSession"
          :slots="booking.form.slots"
          :count="booking.form.count"
          :invalid="invalidSessions"
        />

        <i18n-t
          keypath="form.pickingFor"
          tag="p"
          class="mt-5 mb-3 text-sm text-zinc-600 dark:text-zinc-400"
          scope="global"
        >
          <template #session>
            <strong class="font-semibold text-zinc-900 dark:text-white">
              {{ t('common.session', { n: booking.activeSession + 1 }) }}
            </strong>
          </template>
        </i18n-t>

        <div :data-invalid="!!activeSlotError">
          <Transition
            mode="out-in"
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="opacity-0 translate-y-1"
            leave-active-class="transition duration-100 ease-in"
            leave-to-class="opacity-0"
          >
            <SlotPicker
              :key="booking.activeSession"
              :labelled-by="`session-tab-${booking.activeSession}`"
              :days="activeDays"
              :selected="booking.form.slots[booking.activeSession] ?? ''"
              :capacity="schedule.capacity"
              :counts="schedule.config?.counts ?? {}"
              :taken-by="takenBy"
              @select="booking.toggleSlot(booking.activeSession, $event)"
            />
          </Transition>
        </div>

        <p v-if="activeSlotError" class="mt-3 text-sm font-medium text-rose-600 dark:text-rose-400">
          {{ activeSlotError }}
        </p>

        <ul
          v-if="schedule.capacity"
          class="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400"
          :aria-label="t('common.legend')"
        >
          <li class="flex items-center gap-1.5">
            <span class="h-1.5 w-4 rounded-full bg-brand-500" aria-hidden="true" />{{
              t('common.available')
            }}
          </li>
          <li class="flex items-center gap-1.5">
            <span class="h-1.5 w-4 rounded-full bg-amber-500" aria-hidden="true" />{{
              t('common.filling')
            }}
          </li>
          <li class="flex items-center gap-1.5">
            <span class="h-1.5 w-4 rounded-full bg-rose-500" aria-hidden="true" />{{
              t('common.full')
            }}
          </li>
        </ul>
      </template>
    </FormStep>

    <!-- 4. Make-up session -->
    <FormStep
      :step="4"
      heading-id="step-makeup"
      :title="t('form.step4Title')"
      :description="t('form.step4Description')"
      optional
      :complete="!!booking.form.makeup.trim()"
    >
      <label for="makeup" class="sr-only">{{ t('form.step4Title') }}</label>
      <textarea
        id="makeup"
        v-model="booking.form.makeup"
        name="makeup"
        rows="3"
        :maxlength="MAX_MAKEUP_LENGTH"
        :placeholder="t('form.makeupPlaceholder')"
        class="block w-full resize-y rounded-xl bg-white px-4 py-3 text-base text-zinc-900 ring-1 ring-zinc-950/10 transition outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-brand-500 dark:bg-zinc-950/40 dark:text-white dark:ring-white/10 dark:placeholder:text-zinc-500 dark:focus:ring-brand-400"
      />
      <p class="mt-2 text-right text-xs text-zinc-400 tabular-nums">
        {{ booking.form.makeup.length }}/{{ MAX_MAKEUP_LENGTH }}
      </p>
    </FormStep>

    <!-- Consent (Vietnam PDP Law: explicit, unticked by default, purpose-specific) -->
    <BaseCard :data-invalid="!!consentError">
      <label class="flex cursor-pointer items-start gap-3">
        <input
          v-model="booking.form.consent"
          type="checkbox"
          name="consent"
          class="mt-0.5 size-5 shrink-0 cursor-pointer rounded accent-brand-600"
          :aria-invalid="!!consentError"
          aria-describedby="consent-text"
          data-testid="consent"
        />
        <i18n-t
          id="consent-text"
          keypath="form.consent"
          tag="span"
          class="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
          scope="global"
        >
          <template #controller>{{
            privacy?.controllerName ?? t('form.consentControllerFallback')
          }}</template>
          <template #data>
            <strong class="font-semibold">{{ t('form.consentData') }}</strong>
          </template>
          <template #days>{{ privacy?.retentionDays ?? 180 }}</template>
          <template #notice>
            <RouterLink
              :to="{ name: 'privacy' }"
              target="_blank"
              class="font-semibold text-brand-700 underline underline-offset-4 dark:text-brand-300"
              >{{ t('form.consentNotice') }}</RouterLink
            >
          </template>
        </i18n-t>
      </label>
      <p v-if="consentError" class="mt-2 pl-8 text-sm font-medium text-rose-600 dark:text-rose-400">
        {{ consentError }}
      </p>
    </BaseCard>

    <!-- Desktop shows submit errors in the summary card -->
    <BaseAlert
      v-if="booking.submitError"
      tone="danger"
      :title="t('form.submitErrorTitle')"
      class="lg:hidden"
      data-invalid="true"
    >
      {{ booking.submitError }}
    </BaseAlert>
  </form>
</template>
