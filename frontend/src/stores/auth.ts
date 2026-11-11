import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { t } from '@/i18n'
import { errorMessage } from '@/services/api'
import { authApi } from '@/services/auth'
import type { AuthUser, Role } from '@/types/auth'

/** Who is signed in. Permissions are enforced by the server; this only drives the UI. */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  /** True once the session has been checked (successfully). */
  const loaded = ref(false)
  const error = ref('')
  let pending: Promise<void> | null = null

  const isAdmin = computed(() => user.value?.role === 'admin')
  const hasRole = (roles: readonly Role[]) => !!user.value && roles.includes(user.value.role)

  /** Checks the session once (concurrent callers share the request); `force` re-checks. */
  function load({ force = false } = {}): Promise<void> {
    if (loaded.value && !force) return Promise.resolve()
    pending ??= authApi
      .getUser()
      .then((next) => {
        user.value = next
        loaded.value = true
        error.value = ''
      })
      .catch((e) => {
        error.value = errorMessage(e, t('auth.sessionCheckFailed'))
      })
      .finally(() => {
        pending = null
      })
    return pending
  }

  async function login(email: string, password: string) {
    user.value = await authApi.login(email.trim(), password)
    loaded.value = true
  }

  async function logout() {
    try {
      await authApi.logout()
    } finally {
      user.value = null
    }
  }

  const changePassword = (currentPassword: string, newPassword: string) =>
    authApi.changePassword(currentPassword, newPassword)

  return { user, loaded, error, isAdmin, hasRole, load, login, logout, changePassword }
})
