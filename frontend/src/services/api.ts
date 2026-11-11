import { appConfig } from '@/config/app'
import type {
  ApiErrorBody,
  BookingPayload,
  DeleteResponse,
  ExistingBooking,
  LookupResponse,
  ScheduleConfig,
  SubmitResponse,
} from '@/types/booking'
import { ApiError } from './errors'
import { createMockApi } from './mockApi'

export { ApiError, errorMessage } from './errors'

export interface BookingApi {
  getSchedule(): Promise<ScheduleConfig>
  submitBooking(payload: BookingPayload): Promise<SubmitResponse>
  /** Finds this week's booking for a phone number or email. */
  lookupBooking(contact: string): Promise<ExistingBooking>
  /** Deletes this week's booking (and its personal data) for a phone number or email. */
  deleteBooking(contact: string): Promise<DeleteResponse>
}

/** JSON request to the backend. The session cookie is sent automatically (same origin). */
export async function request<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs)

  try {
    const response = await fetch(`${appConfig.apiUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
      signal: controller.signal,
    })
    const data = (await response.json().catch(() => null)) as T | ApiErrorBody | null

    if (!response.ok) {
      const error = (data as ApiErrorBody | null)?.error
      throw error
        ? new ApiError(error.message, response.status, error.code, error.params)
        : new ApiError(`HTTP ${response.status}`, response.status, 'HTTP_ERROR', {
            status: response.status,
          })
    }
    if (data === null) throw new ApiError('Invalid response', response.status, 'BAD_RESPONSE')
    return data as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('Timeout', 0, 'TIMEOUT')
    }
    throw new ApiError('Network error', 0, 'NETWORK')
  } finally {
    clearTimeout(timer)
  }
}

/** REST client for the backend API (see backend/src/modules). */
function createHttpApi(): BookingApi {
  return {
    getSchedule: () => request<ScheduleConfig>('/schedule'),

    submitBooking: (payload) =>
      request<SubmitResponse>('/bookings', { method: 'POST', body: payload }),

    async lookupBooking(contact) {
      // POST keeps the phone/email out of URLs, browser history and server logs.
      const data = await request<LookupResponse>('/bookings/lookup', {
        method: 'POST',
        body: { contact },
      })
      return data.booking
    },

    deleteBooking: (contact) =>
      request<DeleteResponse>('/bookings/delete', { method: 'POST', body: { contact } }),
  }
}

export const api: BookingApi = appConfig.demoMode ? createMockApi() : createHttpApi()
