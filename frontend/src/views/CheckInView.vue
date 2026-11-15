<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AtSign, CircleCheckBig, LockKeyhole, UserCheck } from '@lucide/vue'

import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import { dayName, timeRange } from '@/i18n/format'
import { api, errorMessage } from '@/services/api'
import { useScheduleStore } from '@/stores/schedule'
import type { CheckInResult } from '@/types/booking'
import { parseSlot } from '@/utils/slots'
import { contactError } from '@/utils/validation'

const { t } = useI18n()
const schedule = useScheduleStore()

onMounted(() => schedule.load())

const contact = ref('')
const touched = ref(false)
const sending = ref(false)
const error = ref('')
const result = ref<CheckInResult | null>(null)

const inputError = computed(() => (touched.value ? contactError(contact.value) : undefined))
const earlyMinutes = computed(() => schedule.config?.checkInEarlyMinutes ?? 30)

const slot = computed(() => (result.value ? parseSlot(result.value.slot) : null))

async function checkIn() {
  touched.value = true
  error.value = ''
  result.value = null
  if (contactError(contact.value) || sending.value) return

  sending.value = true
  try {
    result.value = await api.checkIn(contact.value.trim())
    // Don't keep the phone/email on screen (shared devices at the court).
    contact.value = ''
    touched.value = false
  } catch (e) {
    error.value = errorMessage(e, t('checkIn.failed'))
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
    <div class="mx-auto max-w-xl animate-fade-in-up">
      <h1 class="text-4xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl dark:text-white">
        {{ t('titles.checkIn') }}
      </h1>
      <p class="mt-3 leading-relaxed text-zinc-600 dark:text-zinc-400">
        {{ t('checkIn.intro', { minutes: earlyMinutes }) }}
      </p>

      <BaseCard class="mt-8">
        <form novalidate @submit.prevent="checkIn">
          <label
            for="checkin-contact"
            class="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            {{ t('form.contactLabel') }}
          </label>
          <div class="flex flex-col gap-3 sm:flex-row">
            <div class="relative flex-1">
              <AtSign
                class="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-zinc-400"
                aria-hidden="true"
              />
              <input
                id="checkin-contact"
                v-model="contact"
                type="text"
                inputmode="email"
                autocomplete="off"
                spellcheck="false"
                maxlength="254"
                :placeholder="t('form.contactPlaceholder')"
                :aria-invalid="!!inputError"
                :aria-describedby="inputError ? 'checkin-error' : 'checkin-hint'"
                class="block h-12 w-full rounded-xl bg-white pr-4 pl-10 text-base text-zinc-900 ring-1 transition outline-none placeholder:text-zinc-400 focus:ring-2 dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-zinc-500"
                :class="
                  inputError
                    ? 'ring-rose-400 focus:ring-rose-500 dark:ring-rose-500/60'
                    : 'ring-zinc-950/10 focus:ring-brand-500 dark:ring-white/10 dark:focus:ring-brand-400'
                "
              />
            </div>
            <BaseButton type="submit" size="lg" :icon="UserCheck" :loading="sending">
              {{ t('checkIn.submit') }}
            </BaseButton>
          </div>
          <p
            v-if="inputError"
            id="checkin-error"
            class="mt-2 text-sm font-medium text-rose-600 dark:text-rose-400"
          >
            {{ inputError }}
          </p>
          <p
            v-else
            id="checkin-hint"
            class="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"
          >
            <LockKeyhole class="size-3.5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            {{ t('edit.hint') }}
          </p>
        </form>

        <BaseAlert v-if="error" tone="danger" class="mt-5">{{ error }}</BaseAlert>
      </BaseCard>

      <Transition
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="opacity-0 translate-y-2"
      >
        <BaseCard v-if="result && slot" class="mt-5" aria-live="polite">
          <div class="flex items-start gap-4">
            <div
              class="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-600/10 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20"
            >
              <CircleCheckBig class="size-6" aria-hidden="true" />
            </div>
            <div class="min-w-0">
              <h2 class="text-lg font-semibold tracking-tight">
                {{
                  result.alreadyCheckedIn
                    ? t('checkIn.alreadyTitle', { name: result.zaloName })
                    : t('checkIn.doneTitle', { name: result.zaloName })
                }}
              </h2>
              <p class="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {{ dayName(slot) }} · {{ timeRange(slot) }} ·
                {{ t('common.week', { week: result.weekLabel }) }}
              </p>
            </div>
          </div>
        </BaseCard>
      </Transition>
    </div>
  </div>
</template>
