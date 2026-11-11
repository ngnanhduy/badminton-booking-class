import { computed, reactive, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'

import { appConfig } from '@/config/app'
import { t } from '@/i18n'
import { api, errorMessage } from '@/services/api'
import type { BookingPayload, BookingResult, ExistingBooking, SessionCount } from '@/types/booking'
import { MAX_MAKEUP_LENGTH, validateBooking } from '@/utils/validation'
import { useScheduleStore } from './schedule'

/** Form state, validation and submission for the weekly booking. */
export const useBookingStore = defineStore('booking', () => {
  const schedule = useScheduleStore()
  const rememberedName = useLocalStorage(appConfig.storageKeys.zaloName, '')

  const form = reactive({
    zaloName: rememberedName.value,
    /** Phone or email. Kept in memory only, never in localStorage. */
    contact: '',
    count: null as SessionCount | null,
    slots: ['', '', ''] as string[],
    makeup: '',
    /** Explicit, unticked-by-default consent to the privacy notice. */
    consent: false,
  })

  /** True while changing an existing booking (contact is then locked). */
  const editing = ref(false)
  /** Session tab currently being edited (0-based). */
  const activeSession = ref(0)
  const showErrors = ref(false)
  const submitting = ref(false)
  const submitError = ref('')
  const result = ref<BookingResult | null>(null)

  // Clear selections beyond the chosen number of sessions.
  watch(
    () => form.count,
    (count) => {
      const n = count ?? 0
      for (let i = n; i < form.slots.length; i++) form.slots[i] = ''
      if (activeSession.value >= n) activeSession.value = Math.max(0, n - 1)
    },
  )

  const errors = computed(() => validateBooking(form, schedule.config))
  const isValid = computed(() => Object.keys(errors.value).length === 0)

  const selectedSlots = computed(() =>
    form.slots.slice(0, form.count ?? 0).map((slot, index) => ({ index, slot })),
  )
  const selectedCount = computed(() => selectedSlots.value.filter((s) => s.slot).length)
  const progress = computed(() => (form.count ? selectedCount.value / form.count : 0))

  /** Index of the session (other than `exceptIndex`) that already uses `slot`, or -1. */
  function sessionUsing(slot: string, exceptIndex: number): number {
    return form.slots.findIndex(
      (value, index) => index !== exceptIndex && index < (form.count ?? 0) && value === slot,
    )
  }

  /** Toggles a slot for a session and advances to the next empty session. */
  function toggleSlot(sessionIndex: number, slot: string) {
    if (form.slots[sessionIndex] === slot) {
      form.slots[sessionIndex] = ''
      return
    }
    form.slots[sessionIndex] = slot
    submitError.value = ''

    const total = form.count ?? 0
    for (let step = 1; step < total; step++) {
      const next = (sessionIndex + step) % total
      if (!form.slots[next]) {
        activeSession.value = next
        break
      }
    }
  }

  async function submit(): Promise<boolean> {
    showErrors.value = true
    submitError.value = ''
    if (!isValid.value || !form.count || !form.consent || submitting.value) return false

    const payload: BookingPayload = {
      zaloName: form.zaloName.trim(),
      contact: form.contact.trim(),
      count: form.count,
      slots: form.slots.slice(0, form.count),
      makeup: form.makeup.trim().slice(0, MAX_MAKEUP_LENGTH),
      consent: true,
    }

    submitting.value = true
    try {
      const response = await api.submitBooking(payload)
      schedule.setConfig(response.config)
      rememberedName.value = payload.zaloName
      result.value = {
        ...payload,
        updated: response.updated,
        weekLabel: response.config.weekLabel,
      }
      return true
    } catch (e) {
      submitError.value = errorMessage(e, t('booking.submitFailed'))
      return false
    } finally {
      submitting.value = false
    }
  }

  /** Go back to the form with the submitted values, to change them. */
  function edit() {
    result.value = null
    showErrors.value = false
    editing.value = true
  }

  /** Fills the form with a booking found via contact lookup, ready to be changed. */
  function loadBooking(existing: ExistingBooking, contact: string) {
    form.zaloName = existing.zaloName
    form.contact = contact.trim()
    form.count = existing.count
    form.slots = [0, 1, 2].map((i) => (i < existing.count ? (existing.slots[i] ?? '') : ''))
    form.makeup = existing.makeup
    form.consent = false // re-confirm consent for the changed booking
    activeSession.value = 0
    showErrors.value = false
    submitError.value = ''
    result.value = null
    editing.value = true
  }

  /** Start a fresh booking (e.g. for another student). */
  function reset() {
    form.zaloName = ''
    form.contact = ''
    editing.value = false
    form.count = null
    form.slots = ['', '', '']
    form.makeup = ''
    form.consent = false
    activeSession.value = 0
    showErrors.value = false
    submitError.value = ''
    result.value = null
  }

  return {
    form,
    editing,
    activeSession,
    showErrors,
    submitting,
    submitError,
    result,
    errors,
    isValid,
    selectedSlots,
    selectedCount,
    progress,
    sessionUsing,
    toggleSlot,
    submit,
    edit,
    loadBooking,
    reset,
  }
})
