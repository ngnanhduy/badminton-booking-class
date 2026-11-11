<script setup lang="ts">
const model = defineModel<boolean>({ required: true })
defineProps<{ label: string; description?: string; disabled?: boolean }>()
</script>

<template>
  <label
    class="flex cursor-pointer items-start justify-between gap-4"
    :class="disabled && 'pointer-events-none opacity-60'"
  >
    <span class="min-w-0">
      <span class="block text-sm font-medium text-zinc-800 dark:text-zinc-200">{{ label }}</span>
      <span v-if="description" class="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
        {{ description }}
      </span>
    </span>
    <input
      v-model="model"
      type="checkbox"
      role="switch"
      class="peer sr-only"
      :disabled="disabled"
    />
    <span
      class="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-zinc-300 transition peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition peer-checked:after:translate-x-5 dark:bg-zinc-700 dark:peer-checked:bg-brand-500 dark:peer-focus-visible:ring-offset-zinc-900"
      aria-hidden="true"
    />
  </label>
</template>
