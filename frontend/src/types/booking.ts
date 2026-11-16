/** Personal data processing info shown in the privacy notice (from the backend config). */
export interface PrivacyInfo {
  /** Version of the privacy notice; stored with each student's consent. */
  policyVersion: string
  /** Bookings are deleted automatically after this many days. */
  retentionDays: number
  controllerName: string
  controllerContact: string
}

/** 'upcoming' = switched on, but the opening time hasn't come yet. */
export type RegistrationStatus = 'open' | 'upcoming' | 'closed'

/** Weekly schedule returned by `GET /api/v1/schedule`. */
export interface ScheduleConfig {
  /**
   * The week open for registration (else the latest week), e.g. "9/11 - 15/11". Bookings
   * are grouped by this label.
   */
  weekLabel: string
  /** First day of the week, "YYYY-MM-DD", or null for older weeks. */
  startDate: string | null
  /** Class rules, one per line. */
  rules: string[]
  /** Slot labels allowed for session 1, e.g. "Thứ 2 18h - 20h". */
  slots1: string[]
  /** Slot labels allowed for session 2. */
  slots2: string[]
  /** Slot labels allowed for session 3 (older servers leave it out: use `slots2`). */
  slots3?: string[]
  /** Max students per slot, or `null` for unlimited. */
  capacity: number | null
  /** The admin's on/off switch. Use `status` to know whether bookings are accepted now. */
  open: boolean
  /** Registration window of the current week (ISO date-time), or null when unbounded. */
  opensAt: string | null
  closesAt: string | null
  /** Whether bookings are accepted (switch + window), computed by the server. */
  status: RegistrationStatus
  /** Number of bookings per slot label for the current week. */
  counts: Record<string, number>
  /** Self check-in opens this many minutes before a class starts. */
  checkInEarlyMinutes: number
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

/** A schedule the student booked in an earlier week, offered again on the booking form. */
export interface PastSchedule {
  weekLabel: string
  count: SessionCount
  /** Slot labels in session order (length === count). */
  slots: string[]
}

export interface HistoryResponse {
  /** Newest first, one per distinct set of slots (at most 3). Empty for a new student. */
  history: PastSchedule[]
}

/** Result of a self check-in. */
export interface CheckInResult {
  zaloName: string
  weekLabel: string
  /** The session checked in for, e.g. "Thứ 2 18h - 20h". */
  slot: string
  /** True when it was already marked present (nothing changed). */
  alreadyCheckedIn: boolean
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

/**
 * One student across all weeks kept, from the public `GET /api/v1/members`. Never contains
 * phone/email, notes or ids (admins can ask for the phone/email, see `contact`).
 */
export interface Member {
  zaloName: string
  /**
   * Phone or email. Only from the admin endpoint `GET /api/v1/admin/members` (each request is
   * audited); the public list never has it.
   */
  contact?: string
  /** Number of weeks booked. */
  weeks: number
  /** Sessions booked in total. */
  sessions: number
  /** Their booking in the chosen week, or null. */
  week: { count: number; slots: string[] } | null
  lastWeekLabel: string
  firstBookedAt: string
  lastBookedAt: string
  /** Sessions an admin marked present / absent, over all weeks. */
  attended: number
  absent: number
}

/** A week that can be picked on the members dashboard. */
export interface MemberWeek {
  weekLabel: string
  startDate: string | null
  status: RegistrationStatus
  /** The week the public pages show (the dashboard's default). */
  current: boolean
  /** Number of students booked that week. */
  bookings: number
}

export interface MemberList {
  /** The week `members[].week` refers to. */
  weekLabel: string
  /** Every week, newest first. */
  weeks: MemberWeek[]
  /** Sessions of the chosen week marked present / absent, for the whole class. */
  attendance: { present: number; absent: number }
  members: Member[]
}
