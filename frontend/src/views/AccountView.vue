<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { KeyRound, LogOut, ShieldCheck } from '@lucide/vue'

import UserAvatar from '@/components/auth/UserAvatar.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import { errorMessage } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

/** Must match PASSWORD_MIN_LENGTH in backend/src/lib/password.ts. */
const MIN_PASSWORD = 10

const { t } = useI18n()
const auth = useAuthStore()
const router = useRouter()

const form = reactive({ current: '', next: '', confirm: '' })
const saving = ref(false)
const error = ref('')
const done = ref(false)

const problem = computed(() => {
  if (form.next && form.next.length < MIN_PASSWORD) {
    return t('auth.passwordTooShort', { n: MIN_PASSWORD })
  }
  if (form.confirm && form.next !== form.confirm) return t('auth.passwordMismatch')
  return ''
})
const canSave = computed(
  () => !!form.current && form.next.length >= MIN_PASSWORD && form.next === form.confirm,
)

async function changePassword() {
  error.value = ''
  done.value = false
  if (!canSave.value || saving.value) return
  saving.value = true
  try {
    await auth.changePassword(form.current, form.next)
    form.current = form.next = form.confirm = ''
    done.value = true
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    saving.value = false
  }
}

async function logout() {
  await auth.logout()
  await router.push({ name: 'booking' })
}

const inputClass =
  'block h-11 w-full rounded-xl bg-white px-3.5 text-base text-zinc-900 ring-1 ring-zinc-950/10 outline-none focus:ring-2 focus:ring-brand-500 dark:bg-zinc-950/40 dark:text-white dark:ring-white/10 dark:focus:ring-brand-400'
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300'
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
    <div v-if="auth.user" class="mx-auto max-w-md animate-fade-in-up">
      <h1
        class="text-center text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl dark:text-white"
      >
        {{ t('titles.account') }}
      </h1>

      <BaseCard class="mt-8">
        <div class="flex items-center gap-4">
          <UserAvatar :name="auth.user.name" size="lg" />
          <div class="min-w-0">
            <p class="truncate text-lg font-semibold tracking-tight">{{ auth.user.name }}</p>
            <p class="truncate text-sm text-zinc-500 dark:text-zinc-400">{{ auth.user.email }}</p>
            <span
              class="mt-1.5 inline-flex items-center gap-1 rounded-full bg-brand-600/10 px-2.5 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-600/15 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20"
            >
              <ShieldCheck class="size-3.5" aria-hidden="true" />
              {{ t(`roles.${auth.user.role}`) }}
            </span>
          </div>
        </div>
        <div class="mt-6 grid gap-2 sm:grid-cols-2">
          <BaseButton v-if="auth.isAdmin" :to="{ name: 'admin' }" :icon="ShieldCheck">
            {{ t('auth.adminPage') }}
          </BaseButton>
          <BaseButton variant="secondary" :icon="LogOut" @click="logout">
            {{ t('auth.logout') }}
          </BaseButton>
        </div>
      </BaseCard>

      <BaseCard class="mt-4">
        <h2 class="flex items-center gap-2 text-base font-semibold tracking-tight">
          <KeyRound class="size-4.5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          {{ t('auth.changePassword') }}
        </h2>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {{ t('auth.changePasswordIntro') }}
        </p>
        <form class="mt-5 space-y-4" novalidate @submit.prevent="changePassword">
          <!-- Lets password managers associate the new password with this account. -->
          <input
            type="email"
            autocomplete="username"
            :value="auth.user.email"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            readonly
          />
          <div>
            <label for="pw-current" :class="labelClass">{{ t('auth.currentPassword') }}</label>
            <input
              id="pw-current"
              v-model="form.current"
              type="password"
              autocomplete="current-password"
              :class="inputClass"
            />
          </div>
          <div>
            <label for="pw-new" :class="labelClass">{{ t('auth.newPassword') }}</label>
            <input
              id="pw-new"
              v-model="form.next"
              type="password"
              autocomplete="new-password"
              aria-describedby="pw-new-hint"
              :class="inputClass"
            />
            <p id="pw-new-hint" class="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              {{ t('auth.passwordMin', { n: MIN_PASSWORD }) }}
            </p>
          </div>
          <div>
            <label for="pw-confirm" :class="labelClass">{{ t('auth.confirmPassword') }}</label>
            <input
              id="pw-confirm"
              v-model="form.confirm"
              type="password"
              autocomplete="new-password"
              :class="inputClass"
            />
          </div>

          <p v-if="problem" class="text-sm font-medium text-rose-600 dark:text-rose-400">
            {{ problem }}
          </p>
          <BaseAlert v-if="error" tone="danger">{{ error }}</BaseAlert>
          <BaseAlert v-if="done" tone="success">{{ t('auth.passwordChanged') }}</BaseAlert>

          <BaseButton type="submit" :loading="saving" :disabled="!canSave">
            {{ t('auth.changePassword') }}
          </BaseButton>
        </form>
      </BaseCard>
    </div>
  </div>
</template>
