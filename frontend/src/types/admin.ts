import type { ScheduleConfig, SessionCount } from './booking'
import type { AuthUser } from './auth'

/** A decrypted booking, as admins see it. */
export interface AdminBooking {
  id: string
  weekLabel: string
  zaloName: string
  count: SessionCount
  slots: string[]
  makeup: string
  consentVersion: string
  consentAt: string
  createdAt: string
  updatedAt: string
  /** Phone or email; only present when requested (each request is audited). */
  contact?: string
}

export interface AdminBookingList {
  weekLabel: string
  bookings: AdminBooking[]
}

export interface AdminUser extends AuthUser {
  createdAt: string
  /** null until the first sign-in. */
  lastLoginAt: string | null
}

export type SettingsUpdate = Partial<
  Pick<ScheduleConfig, 'weekLabel' | 'rules' | 'slots1' | 'slots2' | 'capacity' | 'open'>
>
