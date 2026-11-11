<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Eye, EyeOff, LogIn, Mail } from '@lucide/vue'

import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import { errorMessage } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const submitting = ref(false)
const error = ref('')

/** Where to go after signing in: a same-site path from ?returnTo=, else the admin page. */
const returnTo = computed(() => {
  const value = typeof route.query.returnTo === 'string' ? route.query.returnTo : ''
  return value.startsWith('/') && !value.startsWith('//') ? value : '/quan-tri'
})
const forbidden = computed(() => route.query.error === 'forbidden')

onMounted(async () => {
  await auth.load()
  // Already signed in (and not bounced here for lacking a role): go straight on.
  if (auth.user && !forbidden.value) await router.replace(returnTo.value)
})

async function submit() {
  error.value = ''
  if (!email.value.trim() || !password.value || submitting.value) return
  submitting.value = true
  try {
    await auth.login(email.value, password.value)
    password.value = ''
    await router.replace(returnTo.value)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    submitting.value = false
  }
}

const inputClass =
  'block h-12 w-full rounded-xl bg-white pr-11 pl-10 text-base text-zinc-900 ring-1 ring-zinc-950/10 transition outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-brand-500 dark:bg-zinc-950/40 dark:text-white dark:ring-white/10 dark:placeholder:text-zinc-500 dark:focus:ring-brand-400'
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
    <div class="mx-auto max-w-md animate-fade-in-up">
      <h1
        class="text-center text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl dark:text-white"
      >
        {{ t('auth.loginTitle') }}
      </h1>
      <p class="mt-3 text-center text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {{ t('auth.loginIntro') }}
      </p>

      <BaseAlert v-if="forbidden" tone="danger" class="mt-6">{{ t('auth.forbidden') }}</BaseAlert>

      <BaseCard class="mt-6">
        <form class="space-y-5" novalidate @submit.prevent="submit">
          <div>
            <label
              for="login-email"
              class="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              {{ t('auth.email') }}
            </label>
            <div class="relative">
              <Mail
                class="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-zinc-400"
                aria-hidden="true"
              />
              <input
                id="login-email"
                v-model="email"
                type="email"
                name="email"
                autocomplete="username"
                inputmode="email"
                spellcheck="false"
                required
                :placeholder="t('auth.emailPlaceholder')"
                :class="inputClass"
              />
            </div>
          </div>

          <div>
            <label
              for="login-password"
              class="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              {{ t('auth.password') }}
            </label>
            <div class="relative">
              <LogIn
                class="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-zinc-400"
                aria-hidden="true"
              />
              <input
                id="login-password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                name="password"
                autocomplete="current-password"
                required
                :class="inputClass"
              />
              <button
                type="button"
                class="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-zinc-400 transition hover:bg-zinc-950/5 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                :aria-label="showPassword ? t('auth.hidePassword') : t('auth.showPassword')"
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              >
                <component :is="showPassword ? EyeOff : Eye" class="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <BaseAlert v-if="error" tone="danger">{{ error }}</BaseAlert>

          <BaseButton
            type="submit"
            size="lg"
            block
            :icon="LogIn"
            :loading="submitting"
            :disabled="!email.trim() || !password"
          >
            {{ submitting ? t('auth.loggingIn') : t('auth.login') }}
          </BaseButton>
        </form>
      </BaseCard>

      <p class="mt-5 text-center text-xs text-zinc-500 dark:text-zinc-400">
        {{ t('auth.noAccount') }}
      </p>
    </div>
  </div>
</template>
