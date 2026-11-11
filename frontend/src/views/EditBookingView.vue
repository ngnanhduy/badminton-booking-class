<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { AtSign, LockKeyhole, Pencil, Search, Trash2 } from '@lucide/vue'

import BookedSessionList from '@/components/booking/BookedSessionList.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import { api, errorMessage } from '@/services/api'
import { useBookingStore } from '@/stores/booking'
import { useScheduleStore } from '@/stores/schedule'
import type { ExistingBooking } from '@/types/booking'
import { contactError } from '@/utils/validation'

const { t } = useI18n()
const router = useRouter()
const schedule = useScheduleStore()
const booking = useBookingStore()

const contact = ref('')
const touched = ref(false)
const searching = ref(false)
const error = ref('')
const found = ref<ExistingBooking | null>(null)

const inputError = computed(() => (touched.value ? contactError(contact.value) : undefined))

onMounted(() => schedule.load())

async function search() {
  touched.value = true
  error.value = ''
  found.value = null
  deleted.value = false
  confirmingDelete.value = false
  if (contactError(contact.value) || searching.value) return

  searching.value = true
  try {
    found.value = await api.lookupBooking(contact.value.trim())
  } catch (e) {
    error.value = errorMessage(e, t('edit.lookupFailed'))
  } finally {
    searching.value = false
  }
}

function startEditing() {
  if (!found.value) return
  booking.loadBooking(found.value, contact.value)
  router.push({ name: 'booking' })
}

const confirmingDelete = ref(false)
const deleting = ref(false)
const deleted = ref(false)

/** Right to erasure: removes the booking and all its personal data. */
async function deleteBooking() {
  if (!found.value || deleting.value) return
  deleting.value = true
  error.value = ''
  try {
    const response = await api.deleteBooking(contact.value.trim())
    schedule.setConfig(response.config)
    if (booking.form.contact.trim() === contact.value.trim()) booking.reset()
    found.value = null
    deleted.value = true
    contact.value = ''
    touched.value = false
  } catch (e) {
    error.value = errorMessage(e, t('edit.deleteFailed'))
  } finally {
    deleting.value = false
    confirmingDelete.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
    <div class="mx-auto max-w-xl animate-fade-in-up">
      <span
        v-if="schedule.config"
        class="inline-flex items-center rounded-full bg-brand-600/10 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-600/15 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20"
      >
        {{ t('common.week', { week: schedule.config.weekLabel }) }}
      </span>
      <h1
        class="mt-4 text-4xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl dark:text-white"
      >
        {{ t('titles.edit') }}
      </h1>
      <p class="mt-3 leading-relaxed text-zinc-600 dark:text-zinc-400">{{ t('edit.intro') }}</p>

      <BaseCard class="mt-8">
        <form novalidate @submit.prevent="search">
          <label
            for="lookup-contact"
            class="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            {{ t('form.contactLabel') }}
          </label>
          <div class="flex flex-col gap-3 sm:flex-row">
            <div class="relative flex-1">
              <AtSign
                class="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-zinc-400"
                aria-hidden="true"
              />
              <input
                id="lookup-contact"
                v-model="contact"
                type="text"
                autocomplete="off"
                spellcheck="false"
                maxlength="254"
                :placeholder="t('form.contactPlaceholder')"
                :aria-invalid="!!inputError"
                :aria-describedby="inputError ? 'lookup-error' : 'lookup-hint'"
                class="block h-12 w-full rounded-xl bg-white pr-4 pl-10 text-base text-zinc-900 ring-1 transition outline-none placeholder:text-zinc-400 focus:ring-2 dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-zinc-500"
                :class="
                  inputError
                    ? 'ring-rose-400 focus:ring-rose-500 dark:ring-rose-500/60'
                    : 'ring-zinc-950/10 focus:ring-brand-500 dark:ring-white/10 dark:focus:ring-brand-400'
                "
              />
            </div>
            <BaseButton type="submit" size="lg" :icon="Search" :loading="searching">
              {{ t('edit.search') }}
            </BaseButton>
          </div>
          <p
            v-if="inputError"
            id="lookup-error"
            class="mt-2 text-sm font-medium text-rose-600 dark:text-rose-400"
          >
            {{ inputError }}
          </p>
          <p
            v-else
            id="lookup-hint"
            class="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"
          >
            <LockKeyhole class="size-3.5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            {{ t('edit.hint') }}
          </p>
        </form>

        <BaseAlert v-if="error" tone="danger" class="mt-5">{{ error }}</BaseAlert>
      </BaseCard>

      <Transition
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="opacity-0 translate-y-2"
      >
        <BaseCard v-if="found" class="mt-5" aria-labelledby="found-title">
          <p class="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {{ t('edit.found', { week: found.weekLabel }) }}
          </p>
          <h2 id="found-title" class="mt-0.5 text-lg font-semibold tracking-tight">
            {{ found.zaloName }}
          </h2>
          <BookedSessionList
            class="mt-4"
            :slots="found.slots"
            :week-label="found.weekLabel"
            :makeup="found.makeup"
          />
          <BaseButton
            class="mt-5"
            size="lg"
            block
            :icon="Pencil"
            :disabled="schedule.config?.open === false"
            @click="startEditing"
          >
            {{ t('edit.change') }}
          </BaseButton>
          <p
            v-if="schedule.config?.open === false"
            class="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400"
          >
            {{ t('edit.closedNote') }}
          </p>

          <div class="mt-5 border-t border-zinc-950/5 pt-4 dark:border-white/[0.07]">
            <BaseButton
              v-if="!confirmingDelete"
              variant="danger-ghost"
              size="sm"
              :icon="Trash2"
              @click="confirmingDelete = true"
            >
              {{ t('edit.deleteButton') }}
            </BaseButton>
            <div
              v-else
              class="rounded-xl bg-rose-50 p-4 ring-1 ring-rose-200/70 dark:bg-rose-500/10 dark:ring-rose-400/20"
              role="alertdialog"
              aria-labelledby="delete-title"
            >
              <p id="delete-title" class="text-sm font-semibold text-rose-900 dark:text-rose-100">
                {{ t('edit.deleteTitle', { week: found.weekLabel }) }}
              </p>
              <p class="mt-1 text-sm text-rose-800/80 dark:text-rose-200/80">
                {{ t('edit.deleteBody') }}
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                <BaseButton
                  variant="danger"
                  size="sm"
                  :icon="Trash2"
                  :loading="deleting"
                  @click="deleteBooking"
                >
                  {{ t('edit.deleteConfirm') }}
                </BaseButton>
                <BaseButton size="sm" variant="secondary" @click="confirmingDelete = false">
                  {{ t('common.cancel') }}
                </BaseButton>
              </div>
            </div>
          </div>
        </BaseCard>
      </Transition>

      <BaseAlert v-if="deleted" tone="success" :title="t('edit.deletedTitle')" class="mt-5">
        {{ t('edit.deletedBody') }}
      </BaseAlert>
    </div>
  </div>
</template>
