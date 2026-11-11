<script setup lang="ts">
import { computed, type Component } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { LoaderCircle } from '@lucide/vue'

type Variant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'danger-ghost'
type Size = 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    variant?: Variant
    size?: Size
    type?: 'button' | 'submit' | 'reset'
    /** Renders a RouterLink instead of a button. */
    to?: RouteLocationRaw
    /** Renders an external link that opens in a new tab. */
    href?: string
    icon?: Component
    iconRight?: Component
    loading?: boolean
    disabled?: boolean
    block?: boolean
  }>(),
  { variant: 'primary', size: 'md', type: 'button' },
)

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm shadow-brand-900/20 hover:bg-brand-700 dark:bg-brand-500 dark:text-brand-950 dark:hover:bg-brand-400',
  secondary:
    'bg-white text-zinc-800 shadow-xs ring-1 ring-zinc-950/10 hover:bg-zinc-50 dark:bg-white/5 dark:text-zinc-100 dark:ring-white/10 dark:hover:bg-white/10',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/20',
  ghost:
    'text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white',
  danger:
    'bg-rose-600 text-white shadow-sm shadow-rose-900/20 hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400',
  'danger-ghost':
    'text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/10',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 gap-1.5 rounded-lg px-3 text-sm',
  md: 'h-11 gap-2 rounded-xl px-4 text-sm',
  lg: 'h-12 gap-2 rounded-xl px-5 text-[0.9375rem]',
}

const classes = computed(() => [
  'inline-flex items-center justify-center font-semibold whitespace-nowrap transition duration-150 select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60',
  VARIANTS[props.variant],
  SIZES[props.size],
  props.block && 'w-full',
])
</script>

<template>
  <a v-if="href" :href="href" target="_blank" rel="noopener noreferrer" :class="classes">
    <component :is="icon" v-if="icon" class="size-4 shrink-0" aria-hidden="true" />
    <slot />
    <component :is="iconRight" v-if="iconRight" class="size-4 shrink-0" aria-hidden="true" />
    <span class="sr-only">{{ $t('common.newTab') }}</span>
  </a>
  <RouterLink v-else-if="to" :to="to" :class="classes">
    <component :is="icon" v-if="icon" class="size-4 shrink-0" aria-hidden="true" />
    <slot />
    <component :is="iconRight" v-if="iconRight" class="size-4 shrink-0" aria-hidden="true" />
  </RouterLink>
  <button
    v-else
    :type="type"
    :class="classes"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <LoaderCircle v-if="loading" class="size-4 shrink-0 animate-spin" aria-hidden="true" />
    <component :is="icon" v-else-if="icon" class="size-4 shrink-0" aria-hidden="true" />
    <slot />
    <component
      :is="iconRight"
      v-if="iconRight && !loading"
      class="size-4 shrink-0"
      aria-hidden="true"
    />
  </button>
</template>
