import { i18n, t } from '@/i18n'

export type ErrorParams = Record<string, string | number>

/** An error from the API (or the network). `code` is translated in `apiErrors.<code>`. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly code = 'NETWORK',
    readonly params: ErrorParams = {},
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** A user-facing message in the current language for any thrown value. */
export function errorMessage(error: unknown, fallback?: string): string {
  if (error instanceof ApiError) {
    const key = `apiErrors.${error.code}`
    if (i18n.global.te(key)) return t(key, error.params)
  }
  if (error instanceof Error && error.message) return error.message
  return fallback ?? t('errors.generic')
}
