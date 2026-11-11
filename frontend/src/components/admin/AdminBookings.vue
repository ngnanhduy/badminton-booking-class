<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, Inbox, RefreshCw, Search, Trash2 } from '@lucide/vue'

import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { formatDateTime, slotShort } from '@/i18n/format'
import { adminApi } from '@/services/admin'
import { errorMessage } from '@/services/api'
import { useScheduleStore } from '@/stores/schedule'
import type { AdminBooking } from '@/types/admin'
import { parseSlot } from '@/utils/slots'

const { t } = useI18n()
const schedule = useScheduleStore()

const rows = ref<AdminBooking[]>([])
const weekLabel = ref('')
const loading = ref(false)
const error = ref('')
const showContacts = ref(false)
const query = ref('')
const confirmingId = ref<string | null>(null)
const deletingId = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await adminApi.listBookings({ includeContact: showContacts.value })
    rows.value = data.bookings
    weekLabel.value = data.weekLabel
  } catch (e) {
    error.value = errorMessage(e, t('adminBookings.loadFailed'))
  } finally {
    loading.value = false
  }
}
onMounted(load)

function toggleContacts(value: boolean) {
  showContacts.value = value
  load()
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(
    (b) => b.zaloName.toLowerCase().includes(q) || b.contact?.toLowerCase().includes(q),
  )
})

const slotLabel = (value: string) => {
  const slot = parseSlot(value)
  return slot.dayIndex < 7 ? slotShort(slot) : value
}

async function remove(id: string) {
  deletingId.value = id
  error.value = ''
  try {
    const result = await adminApi.deleteBooking(id)
    rows.value = rows.value.filter((b) => b.id !== id)
    schedule.setConfig(result.config)
  } catch (e) {
    error.value = errorMessage(e, t('adminBookings.deleteFailed'))
  } finally {
    deletingId.value = null
    confirmingId.value = null
  }
}

/** Excel-friendly CSV (UTF-8 BOM) of what is currently loaded. */
function exportCsv() {
  const h = (key: string) => t(`adminBookings.csvHeaders.${key}`)
  const header = [
    h('name'),
    ...(showContacts.value ? [h('contact')] : []),
    h('count'),
    ...[1, 2, 3].map((n) => t('common.session', { n })),
    h('makeup'),
    h('updated'),
  ]
  const lines = rows.value.map((b) => [
    b.zaloName,
    ...(showContacts.value ? [b.contact ?? ''] : []),
    String(b.count),
    b.slots[0] ?? '',
    b.slots[1] ?? '',
    b.slots[2] ?? '',
    b.makeup,
    formatDateTime(b.updatedAt),
  ])
  const csv = [header, ...lines]
    .map((cols) => cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `dang-ky-${weekLabel.value.replace(/[^\w-]+/g, '_')}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-4">
    <BaseCard :padded="false" solid>
      <div class="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div class="relative w-full lg:max-w-xs">
          <Search
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <input
            v-model="query"
            type="search"
            :placeholder="t('adminBookings.search')"
            :aria-label="t('adminBookings.searchLabel')"
            class="block h-10 w-full rounded-xl bg-white pr-3 pl-9 text-sm ring-1 ring-zinc-950/10 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-brand-500 dark:bg-zinc-950/40 dark:ring-white/10"
          />
        </div>
        <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
          <BaseSwitch
            :model-value="showContacts"
            :label="t('adminBookings.showContacts')"
            :description="t('adminBookings.showContactsHint')"
            @update:model-value="toggleContacts"
          />
          <div class="flex gap-2">
            <BaseButton
              variant="secondary"
              size="sm"
              :icon="RefreshCw"
              :loading="loading"
              @click="load"
            >
              {{ t('common.refresh') }}
            </BaseButton>
            <BaseButton
              variant="secondary"
              size="sm"
              :icon="Download"
              :disabled="!rows.length"
              @click="exportCsv"
            >
              {{ t('adminBookings.csv') }}
            </BaseButton>
          </div>
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
          class="h-14 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5"
        />
      </div>

      <EmptyState
        v-else-if="!filtered.length"
        class="border-t border-zinc-950/5 dark:border-white/[0.07]"
        :icon="Inbox"
        :title="rows.length ? t('adminBookings.noResults') : t('adminBookings.empty')"
        :description="
          rows.length
            ? t('adminBookings.noResultsHint')
            : t('adminBookings.emptyHint', { week: weekLabel })
        "
      />

      <ul
        v-else
        class="divide-y divide-zinc-950/5 border-t border-zinc-950/5 dark:divide-white/[0.07] dark:border-white/[0.07]"
      >
        <li
          v-for="b in filtered"
          :key="b.id"
          class="grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] md:items-center"
        >
          <div class="min-w-0">
            <p class="truncate font-semibold">{{ b.zaloName }}</p>
            <p v-if="b.contact" class="truncate font-mono text-xs text-zinc-600 dark:text-zinc-300">
              {{ b.contact }}
            </p>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              {{ t('adminBookings.updated', { date: formatDateTime(b.updatedAt) }) }}
            </p>
          </div>
          <div class="min-w-0">
            <ul
              class="flex flex-wrap gap-1.5"
              :aria-label="t('adminBookings.sessions', { n: b.count }, b.count)"
            >
              <li
                v-for="(slot, i) in b.slots"
                :key="slot"
                class="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2 py-1 text-xs font-medium text-brand-800 ring-1 ring-brand-600/10 dark:bg-brand-400/10 dark:text-brand-200 dark:ring-brand-400/15"
              >
                <span class="text-brand-600/70 dark:text-brand-300/70">{{
                  t('common.sessionShort', { n: i + 1 })
                }}</span>
                {{ slotLabel(slot) }}
              </li>
            </ul>
            <p v-if="b.makeup" class="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <span class="font-medium">{{ t('adminBookings.makeup') }}</span> {{ b.makeup }}
            </p>
          </div>
          <div class="flex justify-end">
            <BaseButton
              v-if="confirmingId !== b.id"
              variant="danger-ghost"
              size="sm"
              :icon="Trash2"
              :aria-label="t('adminBookings.deleteLabel', { name: b.zaloName })"
              @click="confirmingId = b.id"
            >
              {{ t('common.delete') }}
            </BaseButton>
            <div v-else class="flex gap-1.5">
              <BaseButton
                variant="danger"
                size="sm"
                :loading="deletingId === b.id"
                @click="remove(b.id)"
              >
                {{ t('common.confirm') }}
              </BaseButton>
              <BaseButton variant="secondary" size="sm" @click="confirmingId = null">
                {{ t('common.cancel') }}
              </BaseButton>
            </div>
          </div>
        </li>
      </ul>
    </BaseCard>
    <p class="text-xs text-zinc-500 dark:text-zinc-400">
      {{ t('adminBookings.footer', { n: rows.length, week: weekLabel || '—' }, rows.length) }}
    </p>
  </div>
</template>
