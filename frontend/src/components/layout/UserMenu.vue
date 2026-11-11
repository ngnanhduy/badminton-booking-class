<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { onClickOutside, onKeyStroke } from '@vueuse/core'
import { KeyRound, LogOut, ShieldCheck } from '@lucide/vue'

import UserAvatar from '@/components/auth/UserAvatar.vue'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const open = ref(false)
const root = useTemplateRef<HTMLElement>('root')
onClickOutside(root, () => (open.value = false))
onKeyStroke('Escape', () => (open.value = false))

onMounted(() => auth.load())

async function logout() {
  open.value = false
  try {
    await auth.logout()
  } finally {
    if (route.meta.requiresAuth || route.meta.roles) await router.push({ name: 'booking' })
  }
}

const itemClass =
  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-950/5 dark:text-zinc-200 dark:hover:bg-white/10'
</script>

<template>
  <!-- Only staff sign in, so visitors see nothing here (the sign-in link is in the footer). -->
  <div v-if="auth.user" ref="root" class="relative">
    <button
      type="button"
      class="grid size-9 place-items-center rounded-full transition hover:opacity-90"
      :aria-expanded="open"
      aria-haspopup="menu"
      :aria-label="t('auth.accountMenu', { name: auth.user.name })"
      @click="open = !open"
    >
      <UserAvatar :name="auth.user.name" size="sm" />
    </button>

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1 scale-95"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="open"
        class="absolute right-0 mt-2 w-64 origin-top-right rounded-2xl bg-white p-1.5 shadow-lg ring-1 shadow-zinc-950/10 ring-zinc-950/[0.08] dark:bg-zinc-900 dark:shadow-black/40 dark:ring-white/10"
        role="menu"
      >
        <div class="flex items-center gap-3 px-3 pt-2 pb-3">
          <UserAvatar :name="auth.user.name" />
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold">{{ auth.user.name }}</p>
            <p class="truncate text-xs text-zinc-500 dark:text-zinc-400">{{ auth.user.email }}</p>
            <span
              class="mt-1 inline-block rounded-full bg-brand-600/10 px-2 py-0.5 text-[0.6875rem] font-semibold text-brand-700 dark:bg-brand-400/15 dark:text-brand-300"
            >
              {{ t(`roles.${auth.user.role}`) }}
            </span>
          </div>
        </div>
        <div class="border-t border-zinc-950/5 pt-1.5 dark:border-white/[0.07]">
          <RouterLink
            v-if="auth.isAdmin"
            :to="{ name: 'admin' }"
            :class="itemClass"
            role="menuitem"
            @click="open = false"
          >
            <ShieldCheck class="size-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            {{ t('auth.adminPage') }}
          </RouterLink>
          <RouterLink
            :to="{ name: 'account' }"
            :class="itemClass"
            role="menuitem"
            @click="open = false"
          >
            <KeyRound class="size-4 text-zinc-400" aria-hidden="true" />
            {{ t('auth.changePassword') }}
          </RouterLink>
          <button type="button" :class="itemClass" role="menuitem" @click="logout">
            <LogOut class="size-4 text-zinc-400" aria-hidden="true" />
            {{ t('auth.logout') }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
