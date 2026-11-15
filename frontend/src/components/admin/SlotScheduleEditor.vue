<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarPlus, Plus, Trash2, Undo2 } from '@lucide/vue'

import SessionToggles from '@/components/admin/SessionToggles.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import TimeInput from '@/components/ui/TimeInput.vue'
import { dayName } from '@/i18n/format'
import {
  addSlotToDays,
  labelOf,
  newDraft,
  templateIssue,
  type SessionFlags,
  type SlotDraft,
  type SlotIssue,
} from '@/utils/slotEditor'

/**
 * A week's time slots, day by day: add, change or remove slots, and choose for each one
 * which sessions of a booking (1, 2, 3) it is offered for.
 */
const drafts = defineModel<SlotDraft[]>({ required: true })
const props = defineProps<{
  /** Bookings per saved slot label (to warn before moving or removing a booked slot). */
  counts: Record<string, number>
  issues: Record<string, SlotIssue>
}>()

const { t } = useI18n()

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const
const slotsOf = (day: number | null) => drafts.value.filter((d) => d.day === day)

// --- One time on several days ---------------------------------------------------------

const id = useId()
const template = reactive({
  days: [] as number[],
  start: '18:00',
  end: '20:00',
  sessions: [true, true, true] as SessionFlags,
})
const templateError = computed(() => {
  const issue = templateIssue(template)
  return issue ? t(`slotEditor.issues.${issue}`) : ''
})
/** Result of the last "Add", until the template changes. */
const addedMessage = ref('')
watch(
  () => [template.start, template.end, ...template.sessions],
  () => (addedMessage.value = ''),
)

function toggleDay(day: number) {
  addedMessage.value = ''
  const i = template.days.indexOf(day)
  if (i === -1) template.days.push(day)
  else template.days.splice(i, 1)
}
const allDays = computed(() => template.days.length === DAYS.length)
function toggleAllDays() {
  addedMessage.value = ''
  template.days = allDays.value ? [] : [...DAYS]
}

function addToDays() {
  if (templateError.value || !template.days.length) return
  const { added, existing } = addSlotToDays(drafts.value, template)
  template.days = []
  addedMessage.value = [
    added && t('slotEditor.quick.added', { n: added }, added),
    existing && t('slotEditor.quick.existing', { n: existing }, existing),
  ]
    .filter(Boolean)
    .join(' ')
}
const others = computed(() => slotsOf(null))

const bookedCount = (d: SlotDraft) => (d.original ? (props.counts[d.original] ?? 0) : 0)
const isMoved = (d: SlotDraft) => !!d.original && !d.removed && labelOf(d) !== d.original

function add(day: number) {
  const active = slotsOf(day).filter((d) => !d.removed)
  drafts.value.push(newDraft(day, active[active.length - 1]))
}

/** Saved slots are only marked (undo until saved); new ones go straight away. */
function remove(d: SlotDraft) {
  if (d.original) d.removed = true
  else drafts.value.splice(drafts.value.indexOf(d), 1)
}

const pill = (on: boolean) =>
  on
    ? 'bg-brand-600 text-white ring-brand-600 dark:bg-brand-500 dark:text-brand-950 dark:ring-brand-500'
    : 'bg-white text-zinc-500 ring-zinc-950/10 hover:text-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-white/10 dark:hover:text-zinc-100'
const groupLabelClass = 'mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400'
/** Fits "18:30" (24-hour times, no icon). */
const timeClass = 'w-[4.25rem] shrink-0'
</script>

<template>
  <div class="grid gap-3 md:grid-cols-2">
    <section
      class="rounded-xl bg-brand-50/60 p-3 ring-1 ring-brand-600/15 sm:p-4 md:col-span-2 dark:bg-brand-400/[0.06] dark:ring-brand-400/15"
      :aria-labelledby="`${id}-title`"
    >
      <div class="flex items-center gap-2">
        <CalendarPlus class="size-4 text-brand-700 dark:text-brand-300" aria-hidden="true" />
        <h3 :id="`${id}-title`" class="text-sm font-semibold">
          {{ t('slotEditor.quick.title') }}
        </h3>
      </div>
      <p class="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
        {{ t('slotEditor.quick.intro') }}
      </p>

      <div class="mt-3 flex flex-wrap items-end gap-x-5 gap-y-3">
        <div role="group" :aria-labelledby="`${id}-time`">
          <p :id="`${id}-time`" :class="groupLabelClass">{{ t('slotEditor.quick.time') }}</p>
          <div class="flex items-center gap-1.5">
            <TimeInput
              v-model="template.start"
              size="sm"
              :label="t('slotEditor.start')"
              :invalid="!!templateError"
              :class="timeClass"
            />
            <span class="text-zinc-400" aria-hidden="true">–</span>
            <TimeInput
              v-model="template.end"
              size="sm"
              :label="t('slotEditor.end')"
              :invalid="!!templateError"
              :class="timeClass"
            />
          </div>
        </div>

        <div role="group" :aria-labelledby="`${id}-days`">
          <div class="flex items-baseline justify-between gap-3">
            <p :id="`${id}-days`" :class="groupLabelClass">{{ t('slotEditor.quick.days') }}</p>
            <button
              type="button"
              class="text-xs font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
              @click="toggleAllDays"
            >
              {{ allDays ? t('slotEditor.quick.clearDays') : t('slotEditor.quick.allDays') }}
            </button>
          </div>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="day in DAYS"
              :key="day"
              type="button"
              class="h-9 w-9 rounded-lg text-xs font-semibold ring-1 transition sm:w-10"
              :class="pill(template.days.includes(day))"
              :aria-pressed="template.days.includes(day)"
              :title="dayName({ dayIndex: day, day: '' })"
              @click="toggleDay(day)"
            >
              {{ dayName({ dayIndex: day, day: '' }, 'short') }}
            </button>
          </div>
        </div>

        <div>
          <p :class="groupLabelClass">{{ t('slotEditor.quick.sessions') }}</p>
          <SessionToggles v-model="template.sessions" class="h-9" />
        </div>

        <BaseButton
          size="sm"
          :icon="Plus"
          :disabled="!!templateError || !template.days.length"
          @click="addToDays"
        >
          {{
            template.days.length
              ? t('slotEditor.quick.add', { n: template.days.length }, template.days.length)
              : t('slotEditor.quick.pickDays')
          }}
        </BaseButton>
      </div>

      <p v-if="templateError" class="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
        {{ templateError }}
      </p>
      <p
        role="status"
        :class="
          addedMessage ? 'mt-2 text-xs font-medium text-brand-800 dark:text-brand-200' : 'sr-only'
        "
      >
        {{ addedMessage }}
      </p>
    </section>

    <section
      v-for="day in DAYS"
      :key="day"
      class="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-950/5 dark:bg-white/[0.03] dark:ring-white/[0.07]"
      :aria-label="dayName({ dayIndex: day, day: '' })"
    >
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold">{{ dayName({ dayIndex: day, day: '' }) }}</h3>
        <BaseButton variant="ghost" size="sm" :icon="Plus" @click="add(day)">
          {{ t('slotEditor.add') }}
        </BaseButton>
      </div>

      <p v-if="!slotsOf(day).length" class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {{ t('slotEditor.noSlots') }}
      </p>
      <ul v-else class="mt-2 space-y-2">
        <li
          v-for="d in slotsOf(day)"
          :key="d.key"
          class="rounded-lg bg-white p-2 ring-1 ring-zinc-950/[0.06] dark:bg-zinc-900 dark:ring-white/10"
          :class="d.removed && 'opacity-60'"
        >
          <div class="flex flex-wrap items-center gap-x-1.5 gap-y-2">
            <div class="flex items-center gap-1" :class="d.removed && 'line-through'">
              <TimeInput
                v-model="d.start"
                size="sm"
                :disabled="d.removed"
                :label="t('slotEditor.start')"
                :invalid="!!issues[d.key]"
                :class="timeClass"
              />
              <span class="text-zinc-400" aria-hidden="true">–</span>
              <TimeInput
                v-model="d.end"
                size="sm"
                :disabled="d.removed"
                :label="t('slotEditor.end')"
                :invalid="!!issues[d.key]"
                :class="timeClass"
              />
            </div>
            <SessionToggles v-model="d.sessions" :disabled="d.removed" class="ml-1" />
            <span
              v-if="bookedCount(d)"
              class="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 tabular-nums dark:bg-sky-400/10 dark:text-sky-200"
            >
              {{ t('slotEditor.booked', { n: bookedCount(d) }, bookedCount(d)) }}
            </span>
            <BaseButton
              v-if="d.removed"
              class="ml-auto"
              variant="ghost"
              size="sm"
              :icon="Undo2"
              @click="d.removed = false"
            >
              {{ t('slotEditor.undo') }}
            </BaseButton>
            <BaseButton
              v-else
              class="ml-auto px-2!"
              variant="danger-ghost"
              size="sm"
              :icon="Trash2"
              :aria-label="t('slotEditor.remove')"
              :title="t('slotEditor.remove')"
              @click="remove(d)"
            />
          </div>
          <p
            v-if="issues[d.key]"
            class="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400"
          >
            {{ t(`slotEditor.issues.${issues[d.key]}`) }}
          </p>
          <p v-else-if="d.removed" class="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
            {{
              bookedCount(d)
                ? t('slotEditor.removedBooked', { n: bookedCount(d) }, bookedCount(d))
                : t('slotEditor.removed')
            }}
          </p>
          <p
            v-else-if="isMoved(d) && bookedCount(d)"
            class="mt-1.5 text-xs text-sky-700 dark:text-sky-300"
          >
            {{ t('slotEditor.moved', { n: bookedCount(d) }, bookedCount(d)) }}
          </p>
        </li>
      </ul>
    </section>

    <section
      v-if="others.length"
      class="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-950/5 md:col-span-2 dark:bg-white/[0.03] dark:ring-white/[0.07]"
    >
      <h3 class="text-sm font-semibold">{{ t('slotEditor.other') }}</h3>
      <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('slotEditor.otherHint') }}</p>
      <ul class="mt-2 space-y-2">
        <li
          v-for="d in others"
          :key="d.key"
          class="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2 ring-1 ring-zinc-950/[0.06] dark:bg-zinc-900 dark:ring-white/10"
          :class="d.removed && 'opacity-60'"
        >
          <input
            v-model="d.text"
            maxlength="100"
            :disabled="d.removed"
            :aria-label="t('slotEditor.otherLabel')"
            class="h-9 min-w-0 flex-1 rounded-lg bg-white px-2.5 text-sm ring-1 ring-zinc-950/10 outline-none focus:ring-2 focus:ring-brand-500 dark:bg-zinc-950/40 dark:ring-white/10"
            :class="d.removed && 'line-through'"
          />
          <SessionToggles v-model="d.sessions" :disabled="d.removed" />
          <BaseButton
            v-if="d.removed"
            variant="ghost"
            size="sm"
            :icon="Undo2"
            @click="d.removed = false"
          >
            {{ t('slotEditor.undo') }}
          </BaseButton>
          <BaseButton
            v-else
            variant="danger-ghost"
            size="sm"
            :icon="Trash2"
            :aria-label="t('slotEditor.remove')"
            @click="remove(d)"
          />
          <p
            v-if="issues[d.key]"
            class="w-full text-xs font-medium text-rose-600 dark:text-rose-400"
          >
            {{ t(`slotEditor.issues.${issues[d.key]}`) }}
          </p>
        </li>
      </ul>
    </section>
  </div>
</template>
