<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EyeOff } from '@lucide/vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { usePages } from '@/composables/usePages'
import { PAGES } from '@/config/pages'
import type { PageId } from '@/types/booking'

/** Shown instead of a page an admin turned off, with links to the pages still on. */
const props = defineProps<{ page: PageId }>()

const { t } = useI18n()
const { canView } = usePages()

const others = computed(() => PAGES.filter((p) => p.id !== props.page && canView(p.id)))
</script>

<template>
  <div class="mx-auto max-w-6xl animate-fade-in-up px-4 py-16 sm:px-6 sm:py-24">
    <EmptyState
      :icon="EyeOff"
      :title="t('pages.offTitle')"
      :description="others.length ? t('pages.offBody') : t('pages.offBodyNone')"
    >
      <BaseButton
        v-for="(link, i) in others"
        :key="link.id"
        :to="{ name: link.id }"
        :icon="link.icon"
        :variant="i === 0 ? 'primary' : 'secondary'"
      >
        {{ t(link.labelKey) }}
      </BaseButton>
    </EmptyState>
  </div>
</template>
