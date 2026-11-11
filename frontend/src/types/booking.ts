/** Personal data processing info shown in the privacy notice (from the backend config). */
export interface PrivacyInfo {
  /** Version of the privacy notice; stored with each student's consent. */
  policyVersion: string
  /** Bookings are deleted automatically after this many days. */
  retentionDays: number
  controllerName: string
  controllerContact: string
}

/** Weekly schedule returned by `GET /api/v1/schedule`. */
export interface ScheduleConfig {
  /** Current week, e.g. "9/11 - 15/11". Bookings are grouped by this label. */
  weekLabel: string
  /** Class rules, one per line. */
  rules: string[]
  /** Slot labels allowed for session 1, e.g. "Thứ 2 18h - 20h". */
  slots1: string[]
  /** Slot labels allowed for sessions 2 and 3. */
  slots2: string[]
  /** Max students per slot, or `null` for unlimited. */
  capacity: number | null
  /** Whether bookings are currently accepted. */
  open: boolean
  /** Number of bookings per slot label for the current week. */
  counts: Record<string, number>
  /** Number of students who booked this week. */
  totalBookings: number
  privacy: PrivacyInfo
}

export type SessionCount = 1 | 2 | 3

export const SESSION_COUNTS: readonly SessionCount[] = [1, 2, 3]

/** Body sent to the backend when submitting a booking. */
export interface BookingPayload {
  zaloName: string
  /** Phone number or email. Encrypted by the backend; used to find the booking for edits. */
  contact: string
  count: SessionCount
  /** Chosen slot label per session, in order (length === count). */
  slots: string[]
  /** Optional make-up session note. */
  makeup: string
  /** Explicit consent to the privacy notice (required by Vietnam's PDP Law). */
  consent: true
}

export interface BookingResult extends BookingPayload {
  /** True when an existing booking with the same Zalo name was updated. */
  updated: boolean
  weekLabel: string
}

export interface SubmitResponse {
  updated: boolean
  config: ScheduleConfig
}

/** This week's booking, returned by a contact lookup (contact itself is never returned). */
export interface ExistingBooking {
  zaloName: string
  count: SessionCount
  slots: string[]
  makeup: string
  weekLabel: string
}

export interface LookupResponse {
  booking: ExistingBooking
}

export interface DeleteResponse {
  deleted: true
  config: ScheduleConfig
}

/** Error body returned by the API for 4xx/5xx responses. */
export interface ApiErrorBody {
  /** `params` holds values for the translated message, e.g. `{ slot }` for SLOT_FULL. */
  error: { code: string; message: string; params?: Record<string, string | number> }
}

export type DayPeriod = 'morning' | 'afternoon' | 'evening'

/** A slot label parsed into its parts. */
export interface Slot {
  /** Original label, used as the stored value. */
  value: string
  /** "Thứ 2" … "Chủ nhật", or "Khác" when it can't be parsed. */
  day: string
  /** "T2" … "CN". */
  dayShort: string
  /** 0 = Monday … 6 = Sunday, 7 = unknown. */
  dayIndex: number
  /** Display time, e.g. "18h – 20h". */
  time: string
  /** Start hour as a decimal (18.5 = 18:30); `null` if unknown. */
  start: number | null
  end: number | null
  period: DayPeriod | null
}

export interface DayGroup {
  day: string
  dayShort: string
  dayIndex: number
  slots: Slot[]
}
