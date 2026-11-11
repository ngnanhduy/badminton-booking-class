import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { appConfig } from '@/config/app'

/** VITE_CLUB_NAME if set (a proper name, not translated), otherwise the translated default. */
export function useClubName() {
  const { t } = useI18n()
  return computed(() => appConfig.clubName || t('app.clubName'))
}
