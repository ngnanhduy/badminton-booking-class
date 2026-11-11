import type { AdminBookingList, AdminUser, SettingsUpdate } from '@/types/admin'
import type { ScheduleConfig } from '@/types/booking'
import { request } from './api'

/** Admin endpoints; the server checks the session's role on every call. */
export const adminApi = {
  listBookings: ({ includeContact = false } = {}) =>
    request<AdminBookingList>(`/admin/bookings${includeContact ? '?includeContact=true' : ''}`),

  deleteBooking: (id: string) =>
    request<{ deleted: true; config: ScheduleConfig }>(`/admin/bookings/${id}`, {
      method: 'DELETE',
    }),

  updateSettings: (changes: SettingsUpdate) =>
    request<ScheduleConfig>('/admin/settings', { method: 'PUT', body: changes }),

  listUsers: () => request<{ users: AdminUser[] }>('/admin/users'),

  /** Creates an admin; the server returns a temporary password, shown to you once. */
  createUser: (email: string, name: string) =>
    request<{ user: AdminUser; temporaryPassword: string }>('/admin/users', {
      method: 'POST',
      body: { email, name },
    }),

  /** Replaces the password with a temporary one and signs that account out everywhere. */
  resetPassword: (id: string) =>
    request<{ temporaryPassword: string }>(`/admin/users/${id}/reset-password`, {
      method: 'POST',
    }),

  deleteUser: (id: string) =>
    request<{ deleted: true }>(`/admin/users/${id}`, { method: 'DELETE' }),
}
