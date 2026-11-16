<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, CheckCheck, ClipboardCheck, RefreshCw, Search } from '@lucide/vue'

import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import WeekPicker from '@/components/admin/WeekPicker.vue'
import { useAdminWeeks } from '@/composables/useAdminWeeks'
import { dayName, slotShort, timeRange } from '@/i18n/format'
import { adminApi } from '@/services/admin'
import { errorMessage } from '@/services/api'
import type { AdminBooking, AttendanceMark } from '@/types/admin'
import { mergeSlots } from '@/utils/slots'
import { slotDate } from '@/utils/week'

const { t } = useI18n()
const { selectedWeek } = useAdminWeeks()

const rows = ref<AdminBooking[]>([])
const weekLabel = ref('')
const loading = ref(false)
const error = ref('')
const query = ref('')
const selectedSlot = ref('')
/** `${bookingId}|${slot}` → present. Missing = not marked yet. */
const marks = reactive(new Map<string, boolean>())
/** Keys currently being saved. */
const saving = reactive(new Set<string>())
/** Keys the student checked in themselves (self check-in). */
const selfMarked = reactive(new Set<string>())

const keyOf = (bookingId: string, slot: string) => `${bookingId}|${slot}`

/** Every class a booking comes to: its sessions, then its make-up class. */
const classesOf = (b: AdminBooking) => (b.makeupSlot ? [...b.slots, b.makeupSlot] : b.slots)

/** Every slot someone booked this week (make-up classes included), Mon → Sun. */
const slots = computed(() => mergeSlots(...rows.value.map(classesOf)))

function membersIn(slot: string) {
  return rows.value.filter((b) => classesOf(b).includes(slot))
}

function tally(slot: string) {
  const members = membersIn(slot)
  const present = members.filter((b) => marks.get(keyOf(b.id, slot)) === true).length
  const marked = members.filter((b) => marks.has(keyOf(b.id, slot))).length
  return {
    total: members.length,
    present,
    absent: marked - present,
    unmarked: members.length - marked,
  }
}

const current = computed(() => slots.value.find((s) => s.value === selectedSlot.value) ?? null)
const currentTally = computed(() => (current.value ? tally(current.value.value) : null))
/** "Thứ 3, 17/11 · 18h – 20h" (date left out when the week label can't be parsed). */
const currentHeading = computed(() => {
  const slot = current.value
  if (!slot) return ''
  const date = slotDate(weekLabel.value, slot.dayIndex)
  const day = date ? `${dayName(slot)}, ${date}` : dayName(slot)
  return `${day} · ${timeRange(slot)}`
})

const members = computed(() => {
  const slot = selectedSlot.value
  const q = query.value.trim().toLowerCase()
  return membersIn(slot)
    .filter((b) => !q || b.zaloName.toLowerCase().includes(q))
    .map((b) => ({
      id: b.id,
      name: b.zaloName,
      /** Coming for their make-up class (not one of their sessions). */
      makeup: !b.slots.includes(slot),
      session: b.slots.includes(slot)
        ? t('common.session', { n: b.slots.indexOf(slot) + 1 })
        : t('common.makeup'),
      key: keyOf(b.id, slot),
      status: marks.get(keyOf(b.id, slot)),
      self: selfMarked.has(keyOf(b.id, slot)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
})

/** Opens on today's class when there is one, otherwise the first slot of the week. */
function pickDefaultSlot() {
  if (slots.value.some((s) => s.value === selectedSlot.value)) return
  const today = (new Date().getDay() + 6) % 7
  selectedSlot.value =
    (slots.value.find((s) => s.dayIndex === today) ?? slots.value[0])?.value ?? ''
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const week = selectedWeek.value
    const [bookings, attendance] = await Promise.all([
      adminApi.listBookings({ week }),
      adminApi.listAttendance(week),
    ])
    if (week !== selectedWeek.value) return // a newer load is on its way
    rows.value = bookings.bookings
    weekLabel.value = bookings.weekLabel
    marks.clear()
    selfMarked.clear()
    for (const r of attendance.records) {
      marks.set(keyOf(r.bookingId, r.slot), r.present)
      if (r.self) selfMarked.add(keyOf(r.bookingId, r.slot))
    }
    pickDefaultSlot()
  } catch (e) {
    error.value = errorMessage(e, t('adminAttendance.loadFailed'))
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(selectedWeek, load)

/** Saves immediately (optimistic); reverts if the server refuses. */
async function save(changes: AttendanceMark[]) {
  if (!changes.length) return
  error.value = ''
  const before = changes.map(
    (c) => [keyOf(c.bookingId, c.slot), marks.get(keyOf(c.bookingId, c.slot))] as const,
  )
  for (const c of changes) {
    const key = keyOf(c.bookingId, c.slot)
    marks.set(key, c.present)
    selfMarked.delete(key)
    saving.add(key)
  }
  try {
    await adminApi.markAttendance(changes)
  } catch (e) {
    for (const [key, value] of before) {
      if (value === undefined) marks.delete(key)
      else marks.set(key, value)
    }
    error.value = errorMessage(e, t('adminAttendance.saveFailed'))
  } finally {
    for (const [key] of before) saving.delete(key)
  }
}

function toggle(bookingId: string, present: boolean) {
  save([{ bookingId, slot: selectedSlot.value, present }])
}

/** Marks everyone in the slot who isn't marked present yet. */
function markAllPresent() {
  const slot = selectedSlot.value
  save(
    membersIn(slot)
      .filter((b) => marks.get(keyOf(b.id, slot)) !== true)
      .map((b) => ({ bookingId: b.id, slot, present: true })),
  )
}
</script>

<template>
  <div class="space-y-4">
    <BaseCard :padded="false" solid>
      <div class="flex flex-col gap-3 p-4 sm:p-5">
        <div class="flex items-center justify-between gap-3">
          <WeekPicker class="w-full sm:w-80" />
          <BaseButton
            variant="secondary"
            size="sm"
            :icon="RefreshCw"
            :loading="loading"
            @click="load"
          >
            {{ t('common.refresh') }}
          </BaseButton>
        </div>

        <h2 v-if="slots.length" class="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          {{ t('adminAttendance.chooseSlot') }}
        </h2>
        <div
          v-if="slots.length"
          class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
          role="radiogroup"
          :aria-label="t('adminAttendance.chooseSlot')"
        >
          <button
            v-for="slot in slots"
            :key="slot.value"
            type="button"
            role="radio"
            :aria-checked="selectedSlot === slot.value"
            class="flex shrink-0 flex-col items-start rounded-xl px-3 py-2 text-left ring-1 transition"
            :class="
              selectedSlot === slot.value
                ? 'bg-brand-600 text-white ring-brand-600 dark:bg-brand-500 dark:text-brand-950 dark:ring-brand-500'
                : 'bg-white text-zinc-800 ring-zinc-950/10 hover:ring-brand-400 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-white/10'
            "
            @click="selectedSlot = slot.value"
          >
            <span class="text-sm font-semibold whitespace-nowrap">{{ slotShort(slot) }}</span>
            <span
              class="text-xs whitespace-nowrap tabular-nums"
              :class="
                selectedSlot === slot.value ? 'opacity-85' : 'text-zinc-500 dark:text-zinc-400'
              "
            >
              {{ t('adminAttendance.presentOf', tally(slot.value)) }}
            </span>
          </button>
        </div>
      </div>

      <BaseAlert v-if="error" tone="danger" class="mx-4 mb-4 sm:mx-5">{{ error }}</BaseAlert>

      <div
        v-if="loading && !rows.length"
        class="space-y-2 border-t border-zinc-950/5 p-4 dark:border-white/[0.07]"
        aria-busy="true"
      >
        <div
          v-for="n in 4"
          :key="n"
          class="h-12 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5"
        />
      </div>

      <EmptyState
        v-else-if="!slots.length"
        class="border-t border-zinc-950/5 dark:border-white/[0.07]"
        :icon="ClipboardCheck"
        :title="t('adminAttendance.empty')"
        :description="t('adminAttendance.emptyHint', { week: weekLabel || '—' })"
      />

      <template v-else-if="current && currentTally">
        <div
          class="flex flex-col gap-3 border-t border-zinc-950/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 dark:border-white/[0.07]"
        >
          <div>
            <p class="font-semibold">{{ currentHeading }}</p>
            <p class="mt-0.5 text-sm text-zinc-600 tabular-nums dark:text-zinc-400">
              {{ t('adminAttendance.summary', currentTally) }}
            </p>
          </div>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div class="relative sm:w-56">
              <Search
                class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400"
                aria-hidden="true"
              />
              <input
                v-model="query"
                type="search"
                :placeholder="t('adminAttendance.search')"
                :aria-label="t('adminAttendance.search')"
                class="block h-9 w-full rounded-xl bg-white pr-3 pl-9 text-sm ring-1 ring-zinc-950/10 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-brand-500 dark:bg-zinc-950/40 dark:ring-white/10"
              />
            </div>
            <BaseButton
              variant="secondary"
              size="sm"
              :icon="CheckCheck"
              :disabled="currentTally.present === currentTally.total"
              @click="markAllPresent"
            >
              {{ t('adminAttendance.markAll') }}
            </BaseButton>
          </div>
        </div>

        <ul
          class="divide-y divide-zinc-950/5 border-t border-zinc-950/5 dark:divide-white/[0.07] dark:border-white/[0.07]"
          :aria-label="t('adminAttendance.listLabel')"
        >
          <li v-if="!members.length" class="px-5 py-8 text-center text-sm text-zinc-500">
            {{ t('adminBookings.noResults') }}
          </li>
          <li v-for="m in members" :key="m.key">
            <label
              class="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-zinc-50 sm:px-5 dark:hover:bg-white/[0.03]"
              :class="saving.has(m.key) && 'opacity-60'"
            >
              <input
                type="checkbox"
                class="peer sr-only"
                :checked="m.status === true"
                :disabled="saving.has(m.key)"
                @change="toggle(m.id, ($event.target as HTMLInputElement).checked)"
              />
              <span
                class="grid size-6 shrink-0 place-items-center rounded-md ring-1 transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500"
                :class="
                  m.status === true
                    ? 'bg-brand-600 text-white ring-brand-600 dark:bg-brand-500 dark:text-brand-950'
                    : 'bg-white ring-zinc-950/20 dark:bg-zinc-900 dark:ring-white/20'
                "
                aria-hidden="true"
              >
                <Check v-if="m.status === true" class="size-4" stroke-width="3" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{{ m.name }}</span>
                <span class="block text-xs text-zinc-500 dark:text-zinc-400">
                  <span v-if="m.makeup" class="font-medium text-amber-700 dark:text-amber-300">
                    {{ m.session }}
                  </span>
                  <template v-else>{{ m.session }}</template>
                  <template v-if="m.self"> · {{ t('adminAttendance.selfCheckedIn') }}</template>
                </span>
              </span>
              <span
                class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                :class="
                  m.status === true
                    ? 'bg-brand-50 text-brand-800 dark:bg-brand-400/10 dark:text-brand-200'
                    : m.status === false
                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300'
                      : 'bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-zinc-400'
                "
              >
                {{
                  m.status === true
                    ? t('adminAttendance.present')
                    : m.status === false
                      ? t('adminAttendance.absent')
                      : t('adminAttendance.unmarked')
                }}
              </span>
            </label>
          </li>
        </ul>
      </template>
    </BaseCard>
    <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('adminAttendance.footer') }}</p>
  </div>
</template>
