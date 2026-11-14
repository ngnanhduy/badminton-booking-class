<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ClipboardCheck } from '@lucide/vue'

import MembersDashboard from '@/components/members/MembersDashboard.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
// Only used to show the "Take attendance" shortcut; the server enforces the admin role.
// (The header's user menu loads the session.)
const auth = useAuthStore()
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
    <header
      class="flex animate-fade-in-up flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <h1
          class="text-4xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl dark:text-white"
        >
          {{ t('titles.members') }}
        </h1>
        <p class="mt-3 max-w-xl leading-relaxed text-zinc-600 dark:text-zinc-400">
          {{ t('members.intro') }}
        </p>
      </div>
      <BaseButton
        v-if="auth.isAdmin"
        :to="{ name: 'admin', query: { tab: 'diem-danh' } }"
        :icon="ClipboardCheck"
      >
        {{ t('members.takeAttendance') }}
      </BaseButton>
    </header>

    <MembersDashboard class="mt-8" />
  </div>
</template>
