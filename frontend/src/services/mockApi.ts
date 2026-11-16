import type {
  BookingPayload,
  CheckInResult,
  DeleteResponse,
  ExistingBooking,
  Member,
  MemberList,
  PastSchedule,
  ScheduleConfig,
  SubmitResponse,
} from '@/types/booking'
import { normalizeContact } from '@/utils/contact'
import { parseSlot } from '@/utils/slots'
import type { BookingApi } from './api'
import { ApiError, type ErrorParams } from './errors'

/** Same codes as the real backend, so messages are translated the same way. */
const fail = (status: number, code: string, message: string, params?: ErrorParams) =>
  new ApiError(message, status, code, params)
const invalidContact = () => fail(400, 'INVALID_CONTACT', 'Số điện thoại hoặc email không hợp lệ.')
const notFound = (week: string) =>
  fail(404, 'BOOKING_NOT_FOUND', `Không tìm thấy đăng ký tuần ${week} với thông tin này.`, { week })

/** Sample data for demo mode (VITE_DEMO=true): no backend needed. */
export function createDemoConfig(): ScheduleConfig {
  return {
    weekLabel: '9/11 - 15/11',
    startDate: '2026-11-09',
    rules: [
      'Không vote = không tính slot học.',
      'Xin off vui lòng nhắn cho Đạt, không nhắn vào gr lớp.',
      'Anh chị học viên lưu ý, bên em hỗ trợ đổi ca, bù ca tối đa 3 lần/tháng.',
    ],
    slots1: [
      'Thứ 2 18h - 20h',
      'Thứ 2 20h - 22h',
      'Thứ 3 18h - 20h',
      'Thứ 3 20h - 22h',
      'Thứ 4 18h - 20h',
      'Thứ 4 20h - 22h',
      'Thứ 5 18h - 20h',
      'Thứ 5 20h - 22h',
      'Thứ 6 18h - 20h',
      'Thứ 6 20h - 22h',
      'Thứ 7 14h - 16h',
      'Thứ 7 18h - 20h',
      'Chủ nhật 10h - 12h',
    ],
    slots2: [
      'Thứ 2 18h - 20h',
      'Thứ 2 20h - 22h',
      'Thứ 3 14h - 16h',
      'Thứ 3 18h - 20h',
      'Thứ 3 20h - 22h',
      'Thứ 4 18h - 20h',
      'Thứ 4 20h - 22h',
      'Thứ 5 14h - 16h',
      'Thứ 5 18h - 20h',
      'Thứ 5 20h - 22h',
      'Thứ 6 18h - 20h',
      'Thứ 6 20h - 22h',
      'Thứ 7 14h - 16h',
      'Thứ 7 18h - 20h',
      'Chủ nhật 10h - 12h',
    ],
    slots3: [
      'Thứ 2 18h - 20h',
      'Thứ 2 20h - 22h',
      'Thứ 3 18h - 20h',
      'Thứ 3 20h - 22h',
      'Thứ 4 18h - 20h',
      'Thứ 4 20h - 22h',
      'Thứ 5 14h - 16h',
      'Thứ 5 18h - 20h',
      'Thứ 5 20h - 22h',
      'Thứ 6 18h - 20h',
      'Thứ 6 20h - 22h',
      'Thứ 7 14h - 16h',
      'Thứ 7 18h - 20h',
      'Chủ nhật 10h - 12h',
    ],
    capacity: 8,
    open: true,
    opensAt: null,
    closesAt: null,
    status: 'open',
    counts: {
      'Thứ 2 18h - 20h': 6,
      'Thứ 2 20h - 22h': 3,
      'Thứ 3 18h - 20h': 4,
      'Thứ 4 20h - 22h': 8,
      'Thứ 5 18h - 20h': 5,
      'Thứ 6 20h - 22h': 2,
      'Thứ 7 14h - 16h': 7,
      'Chủ nhật 10h - 12h': 4,
    },
    totalBookings: 17,
    checkInEarlyMinutes: 30,
    privacy: {
      policyVersion: '2026-11-12',
      retentionDays: 180,
      controllerName: 'Lớp Cầu Lông',
      controllerContact: '',
    },
  }
}

/** Earlier weeks in demo mode (the current one comes from the demo config). */
const DEMO_PAST_WEEKS = [
  { weekLabel: '2/11 - 8/11', startDate: '2026-11-02' },
  { weekLabel: '26/10 - 1/11', startDate: '2026-10-26' },
]

/** In demo mode, this phone number has earlier weeks, to try the schedule suggestions. */
export const DEMO_RETURNING_CONTACT = '0901234567'

function createDemoHistory(): PastSchedule[] {
  const [lastWeek, twoWeeksAgo] = DEMO_PAST_WEEKS.map((w) => w.weekLabel) as [string, string]
  return [
    { weekLabel: lastWeek, count: 2, slots: ['Thứ 2 18h - 20h', 'Thứ 5 18h - 20h'] },
    // "Thứ 4 20h - 22h" is full this week: shows how a slot that can't be booked is handled.
    { weekLabel: twoWeeksAgo, count: 2, slots: ['Thứ 3 18h - 20h', 'Thứ 4 20h - 22h'] },
  ]
}

/** Slots booked that week; `marks` (slot → present) feed the week's attendance total. */
type DemoWeek = { slots: string[]; marks?: Record<string, boolean> }

/** A few sample members for the demo dashboard, with their booking in `week`. */
function createDemoMembers(currentWeek: string, week: string) {
  const [lastWeek, twoWeeksAgo] = DEMO_PAST_WEEKS.map((w) => w.weekLabel) as [string, string]
  const member = (
    zaloName: string,
    totals: { weeks: number; sessions: number; attended: number; absent: number },
    byWeek: Record<string, DemoWeek>,
  ): Member & { marks: Record<string, boolean> } => {
    const booked = byWeek[week]
    const latest = byWeek[currentWeek] ? currentWeek : lastWeek
    return {
      zaloName,
      ...totals,
      week: booked ? { count: booked.slots.length, slots: booked.slots } : null,
      marks: { ...booked?.marks },
      lastWeekLabel: latest,
      firstBookedAt: '2026-09-01T10:00:00.000Z',
      lastBookedAt:
        latest === currentWeek ? '2026-11-09T12:00:00.000Z' : '2026-11-02T12:00:00.000Z',
    }
  }
  return [
    member(
      'Lan Phạm',
      { weeks: 10, sessions: 24, attended: 20, absent: 2 },
      {
        [currentWeek]: { slots: ['Thứ 2 18h - 20h', 'Thứ 5 18h - 20h'] },
        [lastWeek]: {
          slots: ['Thứ 2 18h - 20h', 'Thứ 5 18h - 20h'],
          marks: { 'Thứ 2 18h - 20h': true, 'Thứ 5 18h - 20h': true },
        },
        [twoWeeksAgo]: { slots: ['Thứ 3 18h - 20h'], marks: { 'Thứ 3 18h - 20h': true } },
      },
    ),
    member(
      'Tuấn Hoàng',
      { weeks: 6, sessions: 12, attended: 9, absent: 3 },
      {
        [currentWeek]: { slots: ['Thứ 4 20h - 22h'] },
        [lastWeek]: { slots: ['Thứ 4 20h - 22h'], marks: { 'Thứ 4 20h - 22h': false } },
      },
    ),
    member(
      'Hà Vũ',
      { weeks: 3, sessions: 6, attended: 2, absent: 3 },
      {
        [lastWeek]: {
          slots: ['Thứ 6 18h - 20h', 'Chủ nhật 10h - 12h'],
          marks: { 'Thứ 6 18h - 20h': true },
        },
        [twoWeeksAgo]: { slots: ['Thứ 6 18h - 20h'], marks: { 'Thứ 6 18h - 20h': false } },
      },
    ),
    member(
      'Quang Đỗ',
      { weeks: 1, sessions: 2, attended: 0, absent: 0 },
      { [currentWeek]: { slots: ['Thứ 7 14h - 16h', 'Chủ nhật 10h - 12h'] } },
    ),
  ]
}

const clone = <T>(value: T): T => structuredClone(value)
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * In-memory implementation of the backend contract (same rules and error codes), so the
 * whole UI can be developed and demoed without a server.
 */
export function createMockApi(latencyMs = 600): BookingApi {
  const config = createDemoConfig()
  /** Keyed by normalized contact, like the blind index on the server. */
  const bookings = new Map<string, ExistingBooking>()
  const checkedIn = new Set<string>()

  return {
    async getSchedule() {
      await delay(latencyMs)
      return clone(config)
    },

    async listMembers(week?: string): Promise<MemberList> {
      await delay(latencyMs)
      const weekLabel = week ?? config.weekLabel
      const known = [config.weekLabel, ...DEMO_PAST_WEEKS.map((w) => w.weekLabel)]
      if (!known.includes(weekLabel)) {
        throw fail(404, 'WEEK_NOT_FOUND', 'Không tìm thấy tuần học.')
      }
      const now = new Date().toISOString()
      // Bookings made in this browser belong to the current week.
      const booked: Member[] = [...bookings.values()].map((b) => ({
        zaloName: b.zaloName,
        weeks: 1,
        sessions: b.count,
        week: weekLabel === config.weekLabel ? { count: b.count, slots: [...b.slots] } : null,
        lastWeekLabel: b.weekLabel,
        firstBookedAt: now,
        lastBookedAt: now,
        attended: 0,
        absent: 0,
      }))
      const demo = createDemoMembers(config.weekLabel, weekLabel)
      const marks = demo.flatMap((m) => Object.values(m.marks))
      const bookedIn = (label: string) =>
        createDemoMembers(config.weekLabel, label).filter((m) => m.week).length +
        (label === config.weekLabel ? booked.length : 0)
      return {
        weekLabel,
        weeks: [
          {
            weekLabel: config.weekLabel,
            startDate: config.startDate,
            status: config.status,
            current: true,
          },
          ...DEMO_PAST_WEEKS.map((w) => ({ ...w, status: 'closed' as const, current: false })),
        ].map((w) => ({ ...w, bookings: bookedIn(w.weekLabel) })),
        attendance: {
          present: marks.filter(Boolean).length,
          absent: marks.filter((m) => !m).length,
        },
        members: [...booked, ...demo.map(({ marks: _marks, ...member }) => member)],
      }
    },

    /** Demo: any session booked in this browser counts as today's class. */
    async checkIn(rawContact: string): Promise<CheckInResult> {
      await delay(latencyMs)
      const contact = normalizeContact(rawContact)
      if (!contact) throw invalidContact()
      const booking = bookings.get(contact.value)
      if (!booking?.slots[0]) {
        throw fail(404, 'CHECKIN_NO_CLASS_TODAY', 'Hôm nay bạn không có ca học nào đã đăng ký.')
      }
      const alreadyCheckedIn = checkedIn.has(contact.value)
      checkedIn.add(contact.value)
      return {
        zaloName: booking.zaloName,
        weekLabel: booking.weekLabel,
        slot: booking.slots[0],
        alreadyCheckedIn,
      }
    },

    async lookupBooking(rawContact: string): Promise<ExistingBooking> {
      await delay(latencyMs)
      const contact = normalizeContact(rawContact)
      if (!contact) throw invalidContact()
      const booking = bookings.get(contact.value)
      if (!booking) throw notFound(config.weekLabel)
      return clone(booking)
    },

    async bookingHistory(rawContact: string): Promise<PastSchedule[]> {
      await delay(latencyMs)
      const contact = normalizeContact(rawContact)
      if (!contact) throw invalidContact()
      // Bookings made in this browser are all in the current week, which isn't history.
      return contact.value === DEMO_RETURNING_CONTACT ? createDemoHistory() : []
    },

    async deleteBooking(rawContact: string): Promise<DeleteResponse> {
      await delay(latencyMs)
      const contact = normalizeContact(rawContact)
      if (!contact) throw invalidContact()
      const booking = bookings.get(contact.value)
      if (!booking) throw notFound(config.weekLabel)
      for (const slot of booking.slots) {
        config.counts[slot] = Math.max(0, (config.counts[slot] ?? 1) - 1)
      }
      config.totalBookings--
      bookings.delete(contact.value)
      return { deleted: true, config: clone(config) }
    },

    async submitBooking(payload: BookingPayload): Promise<SubmitResponse> {
      if (payload.consent !== true) {
        throw fail(
          400,
          'VALIDATION_ERROR',
          'Bạn cần đồng ý với thông báo xử lý dữ liệu cá nhân để đăng ký.',
        )
      }
      await delay(latencyMs)
      if (!config.open) throw fail(409, 'BOOKING_CLOSED', 'Đăng ký tuần này đã đóng.')

      const contact = normalizeContact(payload.contact)
      if (!contact) throw invalidContact()

      const name = payload.zaloName.trim()
      const key = contact.value
      const nameTaken = [...bookings.entries()].some(
        ([otherKey, b]) => otherKey !== key && b.zaloName.toLowerCase() === name.toLowerCase(),
      )
      if (!bookings.has(key) && nameTaken) {
        throw fail(
          409,
          'NAME_TAKEN',
          `Tên Zalo "${name}" đã đăng ký tuần này với số điện thoại/email khác. ` +
            'Nếu là bạn, hãy dùng đúng thông tin đã đăng ký.',
          { name },
        )
      }
      const previous = bookings.get(key)?.slots ?? []

      const days = payload.slots.map((s) => parseSlot(s)).filter((s) => s.dayIndex < 7)
      const clash = days.find((s, i) => days.findIndex((o) => o.dayIndex === s.dayIndex) !== i)
      if (clash) {
        throw fail(
          400,
          'SLOT_SAME_DAY',
          `Các buổi phải vào các ngày khác nhau (${clash.day} bị chọn 2 lần).`,
          { day: clash.day },
        )
      }

      if (config.capacity) {
        for (const slot of payload.slots) {
          const others = (config.counts[slot] ?? 0) - (previous.includes(slot) ? 1 : 0)
          if (others >= config.capacity) {
            throw fail(409, 'SLOT_FULL', `Ca "${slot}" đã đủ người, vui lòng chọn ca khác.`, {
              slot,
            })
          }
        }
      }

      for (const slot of previous) config.counts[slot] = Math.max(0, (config.counts[slot] ?? 1) - 1)
      for (const slot of payload.slots) config.counts[slot] = (config.counts[slot] ?? 0) + 1
      if (!bookings.has(key)) config.totalBookings++
      bookings.set(key, {
        zaloName: name,
        count: payload.count,
        slots: [...payload.slots],
        makeup: payload.makeup,
        weekLabel: config.weekLabel,
      })

      return { updated: previous.length > 0, config: clone(config) }
    },
  }
}
