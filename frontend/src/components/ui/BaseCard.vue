<script setup lang="ts">
withDefaults(
  defineProps<{
    as?: string
    padded?: boolean
    /** Opaque background (needed when content scrolls under sticky elements). */
    solid?: boolean
  }>(),
  { as: 'section', padded: true, solid: false },
)
</script>

<template>
  <component
    :is="as"
    class="rounded-2xl shadow-sm ring-1 shadow-zinc-950/[0.03] ring-zinc-950/[0.06] dark:shadow-none dark:ring-white/10"
    :class="[
      solid ? 'bg-white dark:bg-zinc-900' : 'bg-white/90 backdrop-blur-sm dark:bg-zinc-900/70',
      padded && 'p-5 sm:p-6',
    ]"
  >
    <slot />
  </component>
</template>
