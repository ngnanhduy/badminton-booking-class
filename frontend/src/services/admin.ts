import type {
  AdminBookingList,
  AdminUser,
  AttendanceList,
  AttendanceMark,
  WeekInput,
  WeekResponse,
  WeekSummary,
} from '@/types/admin'
import type { ScheduleConfig } from '@/types/booking'
import { request } from './api'

/** "?a=1&b=2" from the defined values, or "". */
function query(params: Record<string, string | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
  const text = search.toString()
  return text ? `?${text}` : ''
}

/** Admin endpoints; the server checks the session's role on every call. */
export const adminApi = {
  /** Bookings of a week (default: the current week). */
  listBookings: ({
    includeContact = false,
    week,
  }: { includeContact?: boolean; week?: string } = {}) =>
    request<AdminBookingList>(
      `/admin/bookings${query({ week, includeContact: includeContact ? 'true' : undefined })}`,
    ),

  deleteBooking: (id: string) =>
    request<{ deleted: true; config: ScheduleConfig }>(`/admin/bookings/${id}`, {
      method: 'DELETE',
    }),

  /** Attendance marks of a week (default: the current week). */
  listAttendance: (week?: string) => request<AttendanceList>(`/admin/attendance${query({ week })}`),

  /** Saves present/absent marks for booked sessions. */
  markAttendance: (marks: AttendanceMark[]) =>
    request<{ saved: number }>('/admin/attendance', { method: 'PUT', body: { marks } }),

  /** Every week (history included), newest first, with settings and counts. */
  listWeeks: () => request<{ weeks: WeekSummary[] }>('/admin/weeks'),

  /**
   * Creates a week; slots, rules and capacity not given are copied from the latest week.
   * Fails with WEEK_ALREADY_OPEN when `open` is set while another week is open.
   */
  createWeek: (input: WeekInput & { weekLabel: string }) =>
    request<WeekResponse>('/admin/weeks', { method: 'POST', body: input }),

  /** Changes a week's settings, including opening/closing its registration. */
  updateWeek: (id: string, changes: WeekInput) =>
    request<WeekResponse>(`/admin/weeks/${id}`, { method: 'PUT', body: changes }),

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
