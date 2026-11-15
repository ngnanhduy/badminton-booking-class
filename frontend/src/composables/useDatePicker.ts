import { computed } from 'vue'
import { enGB, vi } from 'date-fns/locale'
import { useI18n } from 'vue-i18n'

/**
 * Shared settings for @vuepic/vue-datepicker: the app's language, weeks starting on Monday,
 * 24-hour times and translated buttons.
 */
export function useDatePicker() {
  const { t, locale } = useI18n()
  return computed(() => ({
    locale: locale.value === 'en' ? enGB : vi,
    weekStart: 1,
    /** Calendar column headers, Monday first: "T2 … CN" / "Mon … Sun", as elsewhere in the app. */
    dayNames: [0, 1, 2, 3, 4, 5, 6].map((day) => t(`days.short.${day}`)),
    actionRow: {
      selectBtnLabel: t('picker.select'),
      cancelBtnLabel: t('picker.cancel'),
      nowBtnLabel: t('picker.now'),
    },
    ariaLabels: {
      toggleOverlay: t('picker.toggle'),
      menu: t('picker.menu'),
      openTimePicker: t('picker.openTime'),
      closeTimePicker: t('picker.closeTime'),
      nextMonth: t('picker.nextMonth'),
      prevMonth: t('picker.prevMonth'),
      nextYear: t('picker.nextYear'),
      prevYear: t('picker.prevYear'),
    },
  }))
}
