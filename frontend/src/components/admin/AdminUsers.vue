<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Copy, KeyRound, RefreshCw, Trash2, UserPlus } from '@lucide/vue'

import UserAvatar from '@/components/auth/UserAvatar.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import { formatDate } from '@/i18n/format'
import { adminApi } from '@/services/admin'
import { errorMessage } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import type { AdminUser } from '@/types/admin'

const { t } = useI18n()
const auth = useAuthStore()

const users = ref<AdminUser[]>([])
const loading = ref(false)
const error = ref('')
const busyId = ref<string | null>(null)
/** Row awaiting confirmation: which action, for which user. */
const confirming = ref<{ id: string; action: 'reset' | 'delete' } | null>(null)
/** A temporary password to show once, until dismissed. */
const issued = ref<{ email: string; password: string } | null>(null)
const copied = ref(false)

const form = reactive({ email: '', name: '' })
const adding = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    users.value = (await adminApi.listUsers()).users
  } catch (e) {
    error.value = errorMessage(e, t('adminUsers.loadFailed'))
  } finally {
    loading.value = false
  }
}
onMounted(load)

function showPassword(email: string, password: string) {
  issued.value = { email, password }
  copied.value = false
}

async function add() {
  error.value = ''
  if (!form.email.trim() || !form.name.trim() || adding.value) return
  adding.value = true
  try {
    const { user, temporaryPassword } = await adminApi.createUser(
      form.email.trim(),
      form.name.trim(),
    )
    users.value = [...users.value, user]
    showPassword(user.email, temporaryPassword)
    form.email = form.name = ''
  } catch (e) {
    error.value = errorMessage(e, t('adminUsers.actionFailed'))
  } finally {
    adding.value = false
  }
}

async function confirm(user: AdminUser) {
  const action = confirming.value?.action
  busyId.value = user.id
  error.value = ''
  try {
    if (action === 'reset') {
      const { temporaryPassword } = await adminApi.resetPassword(user.id)
      showPassword(user.email, temporaryPassword)
    } else if (action === 'delete') {
      await adminApi.deleteUser(user.id)
      users.value = users.value.filter((u) => u.id !== user.id)
    }
  } catch (e) {
    error.value = errorMessage(e, t('adminUsers.actionFailed'))
  } finally {
    busyId.value = null
    confirming.value = null
  }
}

async function copy() {
  if (!issued.value) return
  try {
    await navigator.clipboard.writeText(issued.value.password)
    copied.value = true
  } catch {
    // Clipboard blocked: the password is still visible to copy by hand.
  }
}

const inputClass =
  'block h-10 w-full rounded-xl bg-white px-3 text-sm text-zinc-900 ring-1 ring-zinc-950/10 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-brand-500 dark:bg-zinc-950/40 dark:text-white dark:ring-white/10'
</script>

<template>
  <div class="space-y-4">
    <BaseAlert tone="info">{{ t('adminUsers.intro') }}</BaseAlert>
    <BaseAlert v-if="error" tone="danger">{{ error }}</BaseAlert>

    <!-- One-time temporary password -->
    <div
      v-if="issued"
      class="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200/80 sm:p-5 dark:bg-amber-400/10 dark:ring-amber-400/20"
      role="status"
    >
      <p class="text-sm font-semibold text-amber-900 dark:text-amber-100">
        {{ t('adminUsers.tempPasswordTitle', { email: issued.email }) }}
      </p>
      <p class="mt-1 text-sm text-amber-800/90 dark:text-amber-200/80">
        {{ t('adminUsers.tempPasswordBody') }}
      </p>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <code
          class="rounded-lg bg-white px-3 py-2 font-mono text-base font-semibold tracking-wide text-zinc-900 ring-1 ring-amber-200 select-all dark:bg-zinc-950/60 dark:text-white dark:ring-amber-400/20"
          data-testid="temp-password"
          >{{ issued.password }}</code
        >
        <BaseButton variant="secondary" size="sm" :icon="copied ? Check : Copy" @click="copy">
          {{ copied ? t('adminUsers.copied') : t('adminUsers.copy') }}
        </BaseButton>
        <BaseButton variant="ghost" size="sm" @click="issued = null">
          {{ t('common.cancel') }}
        </BaseButton>
      </div>
    </div>

    <BaseCard :padded="false" solid>
      <div class="flex items-center justify-between px-4 py-3 sm:px-5">
        <h2 class="text-sm font-semibold">
          {{ t('adminUsers.count', { n: users.length }, users.length) }}
        </h2>
        <BaseButton variant="ghost" size="sm" :icon="RefreshCw" :loading="loading" @click="load">
          {{ t('common.refresh') }}
        </BaseButton>
      </div>

      <ul
        class="divide-y divide-zinc-950/5 border-t border-zinc-950/5 dark:divide-white/[0.07] dark:border-white/[0.07]"
      >
        <li
          v-for="user in users"
          :key="user.id"
          class="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5"
        >
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <UserAvatar :name="user.name" />
            <div class="min-w-0">
              <p class="flex flex-wrap items-center gap-1.5 font-semibold">
                <span class="truncate">{{ user.name }}</span>
                <span
                  v-if="user.id === auth.user?.id"
                  class="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
                  >{{ t('adminUsers.you') }}</span
                >
              </p>
              <p class="truncate text-sm text-zinc-500 dark:text-zinc-400">{{ user.email }}</p>
              <p class="text-xs text-zinc-400 dark:text-zinc-500">
                {{
                  user.lastLoginAt
                    ? t('adminUsers.lastLogin', { date: formatDate(user.lastLoginAt) })
                    : t('adminUsers.neverLoggedIn')
                }}
              </p>
            </div>
          </div>

          <div
            v-if="user.id !== auth.user?.id"
            class="flex flex-wrap items-center gap-2 pl-13 sm:pl-0"
          >
            <template v-if="confirming?.id === user.id">
              <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {{
                  confirming.action === 'reset'
                    ? t('adminUsers.resetConfirm')
                    : t('adminUsers.deleteLabel', { name: user.name }) + '?'
                }}
              </span>
              <BaseButton
                :variant="confirming.action === 'delete' ? 'danger' : 'primary'"
                size="sm"
                :loading="busyId === user.id"
                @click="confirm(user)"
              >
                {{ t('common.confirm') }}
              </BaseButton>
              <BaseButton variant="secondary" size="sm" @click="confirming = null">
                {{ t('common.cancel') }}
              </BaseButton>
            </template>
            <template v-else>
              <BaseButton
                variant="secondary"
                size="sm"
                :icon="KeyRound"
                @click="confirming = { id: user.id, action: 'reset' }"
              >
                {{ t('adminUsers.resetPassword') }}
              </BaseButton>
              <BaseButton
                variant="danger-ghost"
                size="sm"
                :icon="Trash2"
                :aria-label="t('adminUsers.deleteLabel', { name: user.name })"
                @click="confirming = { id: user.id, action: 'delete' }"
              />
            </template>
          </div>
        </li>
      </ul>
    </BaseCard>

    <BaseCard solid>
      <h2 class="flex items-center gap-2 text-base font-semibold tracking-tight">
        <UserPlus class="size-4.5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
        {{ t('adminUsers.addTitle') }}
      </h2>
      <form
        class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
        novalidate
        @submit.prevent="add"
      >
        <div>
          <label for="new-admin-email" class="mb-1.5 block text-sm font-medium">
            {{ t('auth.email') }}
          </label>
          <input
            id="new-admin-email"
            v-model="form.email"
            type="email"
            autocomplete="off"
            spellcheck="false"
            :placeholder="t('auth.emailPlaceholder')"
            :class="inputClass"
          />
        </div>
        <div>
          <label for="new-admin-name" class="mb-1.5 block text-sm font-medium">
            {{ t('adminUsers.name') }}
          </label>
          <input
            id="new-admin-name"
            v-model="form.name"
            autocomplete="off"
            maxlength="100"
            :placeholder="t('adminUsers.namePlaceholder')"
            :class="inputClass"
          />
        </div>
        <BaseButton
          type="submit"
          :icon="UserPlus"
          :loading="adding"
          :disabled="!form.email.trim() || !form.name.trim()"
        >
          {{ t('adminUsers.add') }}
        </BaseButton>
      </form>
    </BaseCard>
  </div>
</template>
