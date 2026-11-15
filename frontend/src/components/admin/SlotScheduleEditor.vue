<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Trash2, Undo2 } from '@lucide/vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import { dayName } from '@/i18n/format'
import { labelOf, newDraft, type SlotDraft, type SlotIssue } from '@/utils/slotEditor'

/**
 * A week's time slots, day by day: add, change or remove slots, and choose for each one
 * whether it is offered for session 1, sessions 2–3, or both.
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
const timeClass =
  'h-9 w-[6.75rem] rounded-lg bg-white px-2 text-sm tabular-nums ring-1 ring-zinc-950/10 outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60 dark:bg-zinc-950/40 dark:ring-white/10 dark:[color-scheme:dark]'
</script>

<template>
  <div class="grid gap-3 md:grid-cols-2">
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
          <div class="flex flex-wrap items-center gap-2">
            <div class="flex items-center gap-1.5" :class="d.removed && 'line-through'">
              <input
                v-model="d.start"
                type="time"
                step="900"
                :disabled="d.removed"
                :aria-label="t('slotEditor.start')"
                :aria-invalid="!!issues[d.key]"
                :class="timeClass"
              />
              <span class="text-zinc-400" aria-hidden="true">–</span>
              <input
                v-model="d.end"
                type="time"
                step="900"
                :disabled="d.removed"
                :aria-label="t('slotEditor.end')"
                :aria-invalid="!!issues[d.key]"
                :class="timeClass"
              />
            </div>
            <div class="flex gap-1">
              <button
                type="button"
                class="h-7 rounded-full px-2.5 text-xs font-medium ring-1 transition disabled:opacity-60"
                :class="pill(d.session1)"
                :aria-pressed="d.session1"
                :disabled="d.removed"
                @click="d.session1 = !d.session1"
              >
                {{ t('slotEditor.session1') }}
              </button>
              <button
                type="button"
                class="h-7 rounded-full px-2.5 text-xs font-medium ring-1 transition disabled:opacity-60"
                :class="pill(d.sessions23)"
                :aria-pressed="d.sessions23"
                :disabled="d.removed"
                @click="d.sessions23 = !d.sessions23"
              >
                {{ t('slotEditor.sessions23') }}
              </button>
            </div>
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
              class="ml-auto"
              variant="danger-ghost"
              size="sm"
              :icon="Trash2"
              :aria-label="t('slotEditor.remove')"
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
          <button
            type="button"
            class="h-7 rounded-full px-2.5 text-xs font-medium ring-1 transition"
            :class="pill(d.session1)"
            :aria-pressed="d.session1"
            :disabled="d.removed"
            @click="d.session1 = !d.session1"
          >
            {{ t('slotEditor.session1') }}
          </button>
          <button
            type="button"
            class="h-7 rounded-full px-2.5 text-xs font-medium ring-1 transition"
            :class="pill(d.sessions23)"
            :aria-pressed="d.sessions23"
            :disabled="d.removed"
            @click="d.sessions23 = !d.sessions23"
          >
            {{ t('slotEditor.sessions23') }}
          </button>
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
