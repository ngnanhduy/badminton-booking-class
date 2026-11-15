import type { RegistrationStatus, ScheduleConfig, SessionCount } from './booking'
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

/** A week's settings, as admins edit them. Every week is kept as history. */
export interface Week {
  id: string
  weekLabel: string
  /** First day of the week, "YYYY-MM-DD" (null for older weeks: read from the label). */
  startDate: string | null
  rules: string[]
  slots1: string[]
  slots2: string[]
  capacity: number | null
  /** Registration switch. Only one week can be open at a time. */
  open: boolean
  opensAt: string | null
  closesAt: string | null
  status: RegistrationStatus
  createdAt: string
}

/** A week in the admin list: settings plus counts. */
export interface WeekSummary extends Week {
  /** The week the public pages show (the open one, else the latest). */
  current: boolean
  bookings: number
  sessions: number
  present: number
  absent: number
  /** Bookings per slot label. */
  counts: Record<string, number>
}

/** A slot whose time was edited: its bookings and attendance move to the new label. */
export interface SlotRename {
  from: string
  to: string
}

/** Fields to change on a week (or to set on a new one). */
export type WeekInput = Partial<
  Pick<
    Week,
    | 'weekLabel'
    | 'startDate'
    | 'rules'
    | 'slots1'
    | 'slots2'
    | 'capacity'
    | 'open'
    | 'opensAt'
    | 'closesAt'
  > & {
    /** Update only. */
    slotRenames: SlotRename[]
  }
>

export interface WeekResponse {
  week: Week
  /** The public schedule after the change (it may now show another week). */
  config: ScheduleConfig
}

/** An admin's present/absent mark for one booked session. No entry = not marked yet. */
export interface AttendanceRecord {
  bookingId: string
  slot: string
  present: boolean
  /** Marked by the student with self check-in. */
  self: boolean
  updatedAt: string
}

export interface AttendanceList {
  weekLabel: string
  records: AttendanceRecord[]
}

export interface AttendanceMark {
  bookingId: string
  slot: string
  present: boolean
}
