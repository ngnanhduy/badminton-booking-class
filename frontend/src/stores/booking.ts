import { computed, reactive, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'

import { appConfig } from '@/config/app'
import { t } from '@/i18n'
import { api, errorMessage } from '@/services/api'
import type {
  BookingPayload,
  BookingResult,
  ExistingBooking,
  PastSchedule,
  SessionCount,
} from '@/types/booking'
import { normalizeContact } from '@/utils/contact'
import { fitSchedule, type ScheduleFit } from '@/utils/history'
import { sessionSlots } from '@/utils/slots'
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
  /**
   * Slots of the saved booking being changed. They stay allowed after their day is over, so
   * a student can still edit the rest of the week without giving up a session already held.
   */
  const savedSlots = ref<string[]>([])
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

  const errors = computed(() =>
    validateBooking(form, schedule.config, {
      pastDays: schedule.pastDays,
      kept: savedSlots.value,
    }),
  )
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

  /* Schedules from earlier weeks, suggested once the student enters their phone/email. */

  /** Earlier schedules found for `historyFor` (a normalized contact). */
  const history = ref<PastSchedule[]>([])
  const historyFor = ref('')
  const historyDismissed = ref(false)
  /** The suggestion last used to fill the form. */
  const appliedSchedule = ref<PastSchedule | null>(null)
  /** Answers per normalized contact, so retyping the same contact doesn't ask again. */
  const historyCache = new Map<string, PastSchedule[]>()

  const normalizedContact = computed(() => normalizeContact(form.contact)?.value ?? '')

  /** Suggestions to show: only for the contact currently typed, and not while editing. */
  const suggestions = computed(() =>
    !editing.value && !historyDismissed.value && historyFor.value === normalizedContact.value
      ? history.value
      : [],
  )

  /** Looks up earlier schedules for the contact in the form. Quietly does nothing on failure. */
  async function loadHistory() {
    const contact = normalizedContact.value
    if (!contact || editing.value || contact === historyFor.value) return
    let found = historyCache.get(contact)
    if (!found) {
      try {
        found = await api.bookingHistory(contact)
      } catch {
        return // only a shortcut: the student can still pick slots by hand
      }
      historyCache.set(contact, found)
    }
    if (contact !== normalizedContact.value) return // the contact changed meanwhile
    history.value = found
    historyFor.value = contact
    historyDismissed.value = false
  }

  /** How an earlier schedule fits this week (slots full, over or no longer offered drop out). */
  function fitPastSchedule(past: PastSchedule): ScheduleFit {
    return fitSchedule(past, {
      offered: sessionSlots(schedule.config),
      pastDays: schedule.pastDays,
      isFull: schedule.isFull,
    })
  }

  /** Fills steps 2–3 with an earlier schedule. Slots that can't be booked are left to pick. */
  function applyPastSchedule(past: PastSchedule) {
    const { slots } = fitPastSchedule(past)
    form.count = past.count
    form.slots = [0, 1, 2].map((i) => slots[i] ?? '')
    activeSession.value = Math.max(0, slots.indexOf(''))
    submitError.value = ''
    appliedSchedule.value = past
  }

  /** Whether the form still holds `past` as it was filled in. */
  function isApplied(past: PastSchedule) {
    if (appliedSchedule.value !== past || form.count !== past.count) return false
    return fitPastSchedule(past).slots.every((slot, i) => !slot || form.slots[i] === slot)
  }

  function dismissHistory() {
    historyDismissed.value = true
  }

  function clearHistory() {
    history.value = []
    historyFor.value = ''
    historyDismissed.value = false
    appliedSchedule.value = null
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
      savedSlots.value = payload.slots
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
    savedSlots.value = existing.slots.slice(0, existing.count)
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
    savedSlots.value = []
    form.count = null
    form.slots = ['', '', '']
    form.makeup = ''
    form.consent = false
    activeSession.value = 0
    showErrors.value = false
    submitError.value = ''
    result.value = null
    clearHistory()
  }

  return {
    form,
    editing,
    savedSlots,
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
    suggestions,
    loadHistory,
    fitPastSchedule,
    applyPastSchedule,
    isApplied,
    dismissHistory,
    submit,
    edit,
    loadBooking,
    reset,
  }
})
