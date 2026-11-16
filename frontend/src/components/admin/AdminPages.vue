<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ArrowUpRight } from '@lucide/vue'

import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { usePages } from '@/composables/usePages'
import { PAGES } from '@/config/pages'
import { adminApi } from '@/services/admin'
import { errorMessage } from '@/services/api'
import { useScheduleStore } from '@/stores/schedule'
import type { PageId } from '@/types/booking'

/**
 * Turns the public pages (menu tabs) on or off. Each switch saves at once; a page that's off
 * is hidden from students and its actions are refused by the server.
 */
const { t } = useI18n()
const schedule = useScheduleStore()
const { isEnabled } = usePages()

/** Pages being saved, with the state they're switching to (shown right away). */
const saving = ref(new Map<PageId, boolean>())
const error = ref('')
/** Announces the last change to screen readers. */
const announcement = ref('')

const shown = (page: PageId) => saving.value.get(page) ?? isEnabled(page)
const onCount = computed(() => PAGES.filter((p) => shown(p.id)).length)

/** Pages whose turning off has a side effect worth a warning. */
const WARNINGS: Partial<Record<PageId, string>> = {
  booking: 'adminPages.offWarnings.booking',
  edit: 'adminPages.offWarnings.edit',
}

async function toggle(page: (typeof PAGES)[number], on: boolean) {
  if (saving.value.has(page.id)) return
  saving.value.set(page.id, on)
  error.value = ''
  try {
    schedule.setConfig(await adminApi.updatePages({ [page.id]: on }))
    announcement.value = t(on ? 'adminPages.turnedOn' : 'adminPages.turnedOff', {
      page: t(page.labelKey),
    })
  } catch (e) {
    error.value = errorMessage(e, t('adminPages.saveFailed'))
  } finally {
    saving.value.delete(page.id)
  }
}
</script>

<template>
  <div class="space-y-4">
    <BaseAlert tone="info">{{ t('adminPages.intro') }}</BaseAlert>
    <BaseAlert v-if="error" tone="danger">{{ error }}</BaseAlert>
    <BaseAlert v-if="schedule.config && onCount === 0" tone="warning">
      {{ t('adminPages.allOff') }}
    </BaseAlert>

    <BaseCard :padded="false" solid>
      <div class="flex items-center justify-between px-4 py-3 sm:px-5">
        <h2 class="text-sm font-semibold">
          {{ t('adminPages.count', { on: onCount, total: PAGES.length }) }}
        </h2>
      </div>

      <ul
        class="divide-y divide-zinc-950/5 border-t border-zinc-950/5 dark:divide-white/[0.07] dark:border-white/[0.07]"
      >
        <li
          v-for="page in PAGES"
          :key="page.id"
          class="flex gap-3.5 px-4 py-4 sm:px-5"
          :data-testid="`page-${page.id}`"
        >
          <div
            class="grid size-10 shrink-0 place-items-center rounded-xl ring-1 transition"
            :class="
              shown(page.id)
                ? 'bg-brand-50 text-brand-600 ring-brand-200/70 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20'
                : 'bg-zinc-100 text-zinc-400 ring-zinc-950/5 dark:bg-white/5 dark:text-zinc-500 dark:ring-white/10'
            "
          >
            <component :is="page.icon" class="size-5" aria-hidden="true" />
          </div>

          <div class="min-w-0 flex-1">
            <BaseSwitch
              :model-value="shown(page.id)"
              :label="t(page.labelKey)"
              :description="t(`adminPages.descriptions.${page.id}`)"
              @update:model-value="toggle(page, $event)"
            />
            <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span
                class="rounded-full px-2 py-0.5 font-semibold"
                :class="
                  shown(page.id)
                    ? 'bg-brand-600/10 text-brand-700 dark:bg-brand-400/15 dark:text-brand-300'
                    : 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'
                "
              >
                {{ shown(page.id) ? t('adminPages.on') : t('adminPages.off') }}
              </span>
              <RouterLink
                :to="{ name: page.id }"
                class="inline-flex items-center gap-0.5 font-medium text-zinc-500 underline-offset-4 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                {{ t('adminPages.open') }}
                <ArrowUpRight class="size-3.5" aria-hidden="true" />
              </RouterLink>
            </div>
            <BaseAlert v-if="!shown(page.id) && WARNINGS[page.id]" tone="warning" class="mt-3">
              {{ t(WARNINGS[page.id]!) }}
            </BaseAlert>
          </div>
        </li>
      </ul>
    </BaseCard>

    <p class="sr-only" aria-live="polite">{{ announcement }}</p>
  </div>
</template>
