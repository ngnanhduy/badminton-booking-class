import { afterEach } from 'vitest'
import { config } from '@vue/test-utils'

import { i18n, setLocale } from '@/i18n'

// Components use useI18n()/$t, so every mount gets the app's i18n instance.
config.global.plugins = [i18n]

// Tests assert Vietnamese texts unless they switch the language themselves.
afterEach(() => setLocale('vi'))
