<script setup lang="ts" generic="T extends string">
import { computed, type Component } from 'vue'
import {
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'
import { Check, ChevronDown, ChevronUp } from '@lucide/vue'

import type { SelectOption } from '@/types/ui'

/**
 * Dropdown in the app's style (Reka UI Select underneath: keyboard, type-ahead and screen
 * readers work like a native select). Option values may be "".
 */
const model = defineModel<T>({ required: true })
const props = withDefaults(
  defineProps<{
    options: SelectOption<T>[]
    /** Id of the trigger, for a `<label for>`. */
    id?: string
    /** Accessible name when there is no visible label. */
    ariaLabel?: string
    placeholder?: string
    icon?: Component
    size?: 'sm' | 'md'
    disabled?: boolean
  }>(),
  { size: 'md' },
)

// Reka reserves "" for "no selection", so empty values travel under another name.
const EMPTY = '__empty__'
const encode = (value: string) => (value === '' ? EMPTY : value)
const value = computed({
  get: () => encode(model.value),
  set: (v: string) => (model.value = (v === EMPTY ? '' : v) as T),
})
const selected = computed(() => props.options.find((o) => o.value === model.value))

const BADGE = {
  brand: 'bg-brand-50 text-brand-800 dark:bg-brand-400/10 dark:text-brand-200',
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200',
  muted: 'bg-zinc-100 text-zinc-600 dark:bg-white/5 dark:text-zinc-400',
} as const
const badgeClass = (o: SelectOption<T>) =>
  `shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${BADGE[o.badgeTone ?? 'brand']}`
</script>

<template>
  <!-- Wrapper so a `class` given to BaseSelect (width, margins) has an element to land on. -->
  <div>
    <SelectRoot v-model="value" :disabled="disabled">
      <SelectTrigger
        :id="id"
        :aria-label="ariaLabel"
        class="group flex w-full items-center gap-2 rounded-xl bg-white px-3 text-left text-sm text-zinc-900 ring-1 ring-zinc-950/10 transition outline-none hover:ring-zinc-950/20 focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60 data-[state=open]:ring-2 data-[state=open]:ring-brand-500 dark:bg-zinc-950/40 dark:text-white dark:ring-white/10 dark:hover:ring-white/20 dark:focus-visible:ring-brand-400 dark:data-[state=open]:ring-brand-400"
        :class="size === 'sm' ? 'h-10' : 'h-11'"
      >
        <component
          :is="icon"
          v-if="icon"
          class="size-4 shrink-0 text-zinc-400"
          aria-hidden="true"
        />
        <SelectValue :placeholder="placeholder" class="flex min-w-0 flex-1 items-center gap-2">
          <template v-if="selected">
            <!-- The label wins the space; the badge shortens first. -->
            <span class="max-w-full shrink-0 truncate font-medium">{{ selected.label }}</span>
            <span
              v-if="selected.badge"
              :class="badgeClass(selected)"
              class="min-w-0 shrink! truncate"
              :title="selected.badge"
            >
              {{ selected.badge }}
            </span>
          </template>
          <span v-else class="truncate text-zinc-400">{{ placeholder }}</span>
        </SelectValue>
        <ChevronDown
          class="size-4 shrink-0 text-zinc-400 transition group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </SelectTrigger>

      <SelectPortal>
        <SelectContent
          position="popper"
          :side-offset="6"
          class="z-50 max-h-[min(22rem,var(--reka-select-content-available-height))] min-w-[var(--reka-select-trigger-width)] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 shadow-zinc-950/10 ring-zinc-950/[0.08] dark:bg-zinc-900 dark:shadow-black/40 dark:ring-white/10"
        >
          <SelectScrollUpButton class="flex h-6 items-center justify-center text-zinc-400">
            <ChevronUp class="size-4" aria-hidden="true" />
          </SelectScrollUpButton>
          <SelectViewport class="p-1">
            <SelectItem
              v-for="o in options"
              :key="o.value"
              :value="encode(o.value)"
              class="relative flex cursor-pointer items-center gap-2 rounded-lg py-2 pr-3 pl-8 text-sm text-zinc-700 outline-none select-none data-[highlighted]:bg-zinc-100 data-[highlighted]:text-zinc-950 data-[state=checked]:font-semibold data-[state=checked]:text-zinc-950 dark:text-zinc-300 dark:data-[highlighted]:bg-white/[0.07] dark:data-[highlighted]:text-white dark:data-[state=checked]:text-white"
            >
              <SelectItemIndicator class="absolute left-2.5 inline-flex">
                <Check class="size-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
              </SelectItemIndicator>
              <SelectItemText class="truncate">{{ o.label }}</SelectItemText>
              <span v-if="o.badge" :class="badgeClass(o)">{{ o.badge }}</span>
              <span
                v-if="o.hint"
                class="ml-auto shrink-0 pl-3 text-xs font-normal text-zinc-500 tabular-nums dark:text-zinc-400"
              >
                {{ o.hint }}
              </span>
            </SelectItem>
          </SelectViewport>
          <SelectScrollDownButton class="flex h-6 items-center justify-center text-zinc-400">
            <ChevronDown class="size-4" aria-hidden="true" />
          </SelectScrollDownButton>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>
  </div>
</template>
