<template>
  <div
    class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start xl:gap-8"
    aria-busy="true"
    :aria-label="$t('common.loadingSchedule')"
  >
    <div class="space-y-5">
      <div
        v-for="n in 3"
        :key="n"
        class="rounded-2xl bg-white/70 p-6 ring-1 ring-zinc-950/5 dark:bg-zinc-900/50 dark:ring-white/10"
      >
        <div class="flex items-center gap-3.5">
          <div class="size-8 animate-pulse rounded-full bg-zinc-200/80 dark:bg-white/10" />
          <div class="h-4 w-40 animate-pulse rounded bg-zinc-200/80 dark:bg-white/10" />
        </div>
        <div class="mt-5 space-y-3 sm:pl-[2.875rem]">
          <div class="h-12 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5" />
          <div v-if="n === 3" class="grid gap-3 sm:grid-cols-2">
            <div
              v-for="m in 6"
              :key="m"
              class="h-28 animate-pulse rounded-2xl bg-zinc-100 dark:bg-white/5"
            />
          </div>
        </div>
      </div>
    </div>
    <div
      class="hidden h-80 animate-pulse rounded-2xl bg-white/70 ring-1 ring-zinc-950/5 lg:block dark:bg-zinc-900/50 dark:ring-white/10"
    />
  </div>
</template>
