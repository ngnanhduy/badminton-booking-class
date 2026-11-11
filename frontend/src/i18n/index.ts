import { createI18n } from 'vue-i18n'

import en from './locales/en'
import vi, { type Messages } from './locales/vi'

export const LOCALES = ['vi', 'en'] as const
export type Locale = (typeof LOCALES)[number]

const STORAGE_KEY = 'badminton:locale'

/** Vietnamese by default (the class is in Vietnam); a saved choice wins. */
function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && (LOCALES as readonly string[]).includes(saved)) return saved as Locale
  } catch {
    // Storage unavailable (private mode, tests): use the default.
  }
  return 'vi'
}

export const i18n = createI18n<[Messages], Locale, false>({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'vi',
  messages: { vi, en },
})

/** Global translate function, for code outside components (stores, utils, services). */
export const t = i18n.global.t

export const currentLocale = () => i18n.global.locale.value as Locale

export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Not persisted; the choice still applies until the page is reloaded.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = locale
}

if (typeof document !== 'undefined') document.documentElement.lang = currentLocale()

/** BCP 47 tag for Intl date/number formatting. */
export const intlLocale = () => (currentLocale() === 'en' ? 'en-GB' : 'vi-VN')
