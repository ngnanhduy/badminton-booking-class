<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Member } from '@/types/booking'
import { attendanceRate, formatPercent } from '@/utils/members'

/**
 * One student on the members dashboard: name, attendance, and (default slot) details such as
 * their other sessions that week. Lays out on the grid of the dashboard's column header.
 */
const props = defineProps<{ member: Member }>()

const { t } = useI18n()

const rate = computed(() => attendanceRate(props.member))
const marked = computed(() => props.member.attended + props.member.absent)

/** "Duy Nguyễn" → "DN"; one-word names use their first letter. */
const initials = computed(() => {
  const words = props.member.zaloName.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? [words[0]!, words[words.length - 1]!] : words
  return letters.map((w) => [...w][0]!.toLocaleUpperCase('vi')).join('')
})

const AVATARS = [
  'bg-brand-100 text-brand-800 dark:bg-brand-400/15 dark:text-brand-200',
  'bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200',
  'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200',
  'bg-violet-100 text-violet-800 dark:bg-violet-400/15 dark:text-violet-200',
  'bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-200',
  'bg-teal-100 text-teal-800 dark:bg-teal-400/15 dark:text-teal-200',
]
/** Same name, same colour, so people are easy to spot again. */
const avatarClass = computed(() => {
  let hash = 0
  for (const ch of props.member.zaloName) hash = (hash * 31 + ch.codePointAt(0)!) | 0
  return AVATARS[Math.abs(hash) % AVATARS.length]
})

const barClass = computed(() => {
  const value = rate.value
  if (value === null) return 'bg-zinc-300 dark:bg-zinc-700'
  if (value >= 0.8) return 'bg-brand-500'
  if (value >= 0.5) return 'bg-amber-500'
  return 'bg-rose-500'
})

const attendanceTitle = computed(() =>
  marked.value
    ? t('members.attendanceTitle', { attended: props.member.attended, total: marked.value })
    : t('members.notMarked'),
)
</script>

<template>
  <li
    class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 transition-colors hover:bg-zinc-50/80 sm:px-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_10rem] dark:hover:bg-white/[0.02]"
  >
    <div class="flex min-w-0 items-center gap-3">
      <span
        class="grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold"
        :class="avatarClass"
        aria-hidden="true"
      >
        {{ initials }}
      </span>
      <span class="truncate font-semibold">{{ member.zaloName }}</span>
    </div>

    <!-- Attendance: next to the name on phones, last column from md. -->
    <div
      class="flex items-center justify-end gap-2.5 md:order-3 md:justify-start"
      :title="attendanceTitle"
    >
      <span
        class="hidden h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-zinc-200 sm:block dark:bg-white/10"
        aria-hidden="true"
      >
        <span
          class="block h-full rounded-full"
          :class="barClass"
          :style="{ width: `${Math.round((rate ?? 0) * 100)}%` }"
        />
      </span>
      <span class="text-sm whitespace-nowrap tabular-nums">
        <span class="sr-only">{{ t('members.colAttendance') }}:</span>
        <span class="font-semibold">{{ formatPercent(rate) }}</span>
        <span v-if="marked" class="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
          {{ member.attended }}/{{ marked }}
        </span>
      </span>
    </div>

    <!-- Details: under the name on phones (aligned with it), middle column from md. -->
    <div
      class="col-span-2 min-w-0 pl-12 md:order-2 md:col-span-1 md:pl-0"
      :class="!$slots.default && 'hidden md:block'"
    >
      <slot />
    </div>
  </li>
</template>
