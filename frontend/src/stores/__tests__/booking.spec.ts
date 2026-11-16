import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

import type { BookingApi } from '@/services/api'
import { createMockApi } from '@/services/mockApi'
import type { PastSchedule } from '@/types/booking'
import { useBookingStore } from '../booking'
import { useScheduleStore } from '../schedule'

// A fresh in-memory backend for every test.
const backend = vi.hoisted(() => ({ current: null as BookingApi | null }))

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return {
    ...actual,
    api: {
      getSchedule: () => backend.current!.getSchedule(),
      submitBooking: (payload) => backend.current!.submitBooking(payload),
      lookupBooking: (contact) => backend.current!.lookupBooking(contact),
      bookingHistory: (contact) => backend.current!.bookingHistory(contact),
      deleteBooking: (contact) => backend.current!.deleteBooking(contact),
      listMembers: (week) => backend.current!.listMembers(week),
      checkIn: (contact) => backend.current!.checkIn(contact),
    } satisfies BookingApi,
  }
})

async function setup() {
  const schedule = useScheduleStore()
  await schedule.load()
  return { schedule, booking: useBookingStore() }
}

/** Fills name, contact and a single session. */
async function fillOneSession(
  booking: ReturnType<typeof useBookingStore>,
  { name = 'Minh Anh', contact = '0912 345 678', slot = 'Thứ 2 18h - 20h' } = {},
) {
  booking.form.zaloName = name
  booking.form.contact = contact
  booking.form.consent = true
  booking.form.count = 1
  await nextTick()
  booking.toggleSlot(0, slot)
}

/** Days of the demo week (9/11 - 15/11/2026), at 8:00. Only Date is faked: timers stay real. */
const demoDay = (day: number) => new Date(2026, 10, day, 8)

describe('booking store', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(demoDay(9)) // Monday: the whole week can be booked
    localStorage.clear()
    backend.current = createMockApi(0)
    setActivePinia(createPinia())
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("won't book Monday on Tuesday, but keeps a Monday session already booked", async () => {
    vi.setSystemTime(demoDay(10)) // Tuesday
    const { booking } = await setup()
    await fillOneSession(booking)
    expect(booking.errors.slot0).toContain('thuộc ngày đã qua')
    expect(await booking.submit()).toBe(false)

    // Booked on Monday, changed on Tuesday: the Monday session may stay.
    booking.loadBooking(
      { zaloName: 'Minh Anh', count: 1, slots: ['Thứ 2 18h - 20h'], makeup: '', weekLabel: '' },
      '0912 345 678',
    )
    expect(booking.errors.slot0).toBeUndefined()
    booking.reset()
    expect(booking.savedSlots).toEqual([])
  })

  it('advances to the next empty session after picking a slot', async () => {
    const { booking } = await setup()
    booking.form.count = 3
    await nextTick()

    booking.toggleSlot(0, 'Thứ 2 18h - 20h')
    expect(booking.activeSession).toBe(1)

    booking.toggleSlot(1, 'Thứ 4 18h - 20h')
    expect(booking.activeSession).toBe(2)
    expect(booking.selectedCount).toBe(2)

    // Clicking the selected slot again clears it.
    booking.toggleSlot(1, 'Thứ 4 18h - 20h')
    expect(booking.form.slots[1]).toBe('')
  })

  it('clears selections beyond the chosen number of sessions', async () => {
    const { booking } = await setup()
    booking.form.count = 3
    await nextTick()
    booking.form.slots = ['Thứ 2 18h - 20h', 'Thứ 3 18h - 20h', 'Thứ 5 18h - 20h']
    booking.activeSession = 2

    booking.form.count = 1
    await nextTick()

    expect(booking.form.slots).toEqual(['Thứ 2 18h - 20h', '', ''])
    expect(booking.activeSession).toBe(0)
  })

  it('does not submit an invalid form', async () => {
    const { booking } = await setup()
    const ok = await booking.submit()

    expect(ok).toBe(false)
    expect(booking.showErrors).toBe(true)
    expect(booking.errors.zaloName).toBeDefined()
    expect(booking.errors.contact).toBeDefined()
    expect(booking.result).toBeNull()
  })

  it('submits, updates counts and remembers the Zalo name (not the contact)', async () => {
    const { booking, schedule } = await setup()
    const before = schedule.countOf('Thứ 2 18h - 20h')

    await fillOneSession(booking, { name: ' Minh Anh ' })

    expect(await booking.submit()).toBe(true)
    expect(booking.result).toMatchObject({
      zaloName: 'Minh Anh',
      slots: ['Thứ 2 18h - 20h'],
      updated: false,
    })
    expect(schedule.countOf('Thứ 2 18h - 20h')).toBe(before + 1)
    expect(localStorage.getItem('badminton:zalo-name')).toBe('Minh Anh')
    expect(JSON.stringify({ ...localStorage })).not.toContain('0912')
  })

  it('updates the booking that matches the contact instead of double counting', async () => {
    const { booking, schedule } = await setup()
    await fillOneSession(booking)
    await booking.submit()
    const afterFirst = schedule.countOf('Thứ 2 18h - 20h')

    booking.edit()
    booking.form.contact = '+84 912.345.678' // same number, different format
    booking.toggleSlot(0, 'Thứ 3 18h - 20h')
    await booking.submit()

    expect(booking.result?.updated).toBe(true)
    expect(schedule.countOf('Thứ 2 18h - 20h')).toBe(afterFirst - 1)
  })

  it('rejects a Zalo name already booked with a different contact', async () => {
    const { booking } = await setup()
    await fillOneSession(booking)
    await booking.submit()

    booking.reset()
    await fillOneSession(booking, { contact: 'someone@else.com' })

    expect(await booking.submit()).toBe(false)
    expect(booking.submitError).toContain('số điện thoại/email khác')
  })

  it('loads a booking found by contact lookup for editing', async () => {
    const { booking } = await setup()
    booking.form.zaloName = 'Lan'
    booking.form.contact = 'Lan@Example.com'
    booking.form.consent = true
    booking.form.count = 2
    await nextTick()
    booking.toggleSlot(0, 'Thứ 2 18h - 20h')
    booking.toggleSlot(1, 'Thứ 5 14h - 16h')
    booking.form.makeup = 'Bù ca 3/11'
    await booking.submit()
    booking.reset()

    const found = await backend.current!.lookupBooking('lan@example.com')
    booking.loadBooking(found, 'lan@example.com')
    await nextTick()

    expect(booking.editing).toBe(true)
    expect(booking.form).toMatchObject({
      zaloName: 'Lan',
      count: 2,
      slots: ['Thứ 2 18h - 20h', 'Thứ 5 14h - 16h', ''],
      makeup: 'Bù ca 3/11',
    })
    await expect(backend.current!.lookupBooking('0999999999')).rejects.toThrow('Không tìm thấy')
  })

  it('requires explicit consent before submitting', async () => {
    const { booking } = await setup()
    await fillOneSession(booking)
    booking.form.consent = false

    expect(await booking.submit()).toBe(false)
    expect(booking.errors.consent).toContain('đồng ý')

    booking.form.consent = true
    expect(await booking.submit()).toBe(true)
  })

  it('deletes a booking by contact and frees its slot', async () => {
    const { booking, schedule } = await setup()
    const before = schedule.countOf('Thứ 2 18h - 20h')
    await fillOneSession(booking)
    await booking.submit()

    const response = await backend.current!.deleteBooking('0912345678')
    schedule.setConfig(response.config)

    expect(schedule.countOf('Thứ 2 18h - 20h')).toBe(before)
    await expect(backend.current!.lookupBooking('0912345678')).rejects.toThrow('Không tìm thấy')
  })

  it('surfaces backend errors (e.g. a full slot)', async () => {
    const { booking } = await setup()
    await fillOneSession(booking, { slot: 'Thứ 4 20h - 22h' }) // 8/8 in the demo data

    expect(await booking.submit()).toBe(false)
    expect(booking.submitError).toContain('đã đủ người')
  })
})

describe('schedules from earlier weeks', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(demoDay(9))
    localStorage.clear()
    backend.current = createMockApi(0)
    setActivePinia(createPinia())
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('suggests them for a returning contact and fills the form with the one picked', async () => {
    const { booking } = await setup()
    booking.form.contact = '0901 234 567' // DEMO_RETURNING_CONTACT
    await booking.loadHistory()
    expect(booking.suggestions.map((s) => s.weekLabel)).toEqual(['2/11 - 8/11', '26/10 - 1/11'])
    const [lastWeek, older] = booking.suggestions as [PastSchedule, PastSchedule]

    booking.applyPastSchedule(lastWeek)
    await nextTick()
    expect(booking.form.count).toBe(2)
    expect(booking.form.slots).toEqual(['Thứ 2 18h - 20h', 'Thứ 5 18h - 20h', ''])
    expect(booking.isApplied(lastWeek)).toBe(true)
    // Only the name and consent are left to fill in.
    expect(Object.keys(booking.errors).sort()).toEqual(['consent', 'zaloName'])

    // "Thứ 4 20h - 22h" is full this week: that session is left for the student to pick.
    booking.applyPastSchedule(older)
    await nextTick()
    expect(booking.form.slots).toEqual(['Thứ 3 18h - 20h', '', ''])
    expect(booking.activeSession).toBe(1)
    expect(booking.isApplied(lastWeek)).toBe(false)
    booking.toggleSlot(1, 'Thứ 5 18h - 20h')
    expect(booking.isApplied(older)).toBe(true)

    // Changing a suggested slot by hand means the form no longer holds that schedule.
    booking.toggleSlot(0, 'Thứ 2 20h - 22h')
    expect(booking.isApplied(older)).toBe(false)
  })

  it('shows them only for the contact typed, until dismissed or reset', async () => {
    const { booking } = await setup()
    booking.form.contact = '0912 345 678'
    await booking.loadHistory()
    expect(booking.suggestions).toEqual([])

    booking.form.contact = '+84 901 234 567'
    await booking.loadHistory()
    expect(booking.suggestions).toHaveLength(2)
    booking.form.contact = '0901 234 56'
    expect(booking.suggestions).toEqual([])
    booking.form.contact = '0901234567'
    expect(booking.suggestions).toHaveLength(2)

    booking.dismissHistory()
    expect(booking.suggestions).toEqual([])
    booking.reset()
    booking.form.contact = '0901234567'
    await booking.loadHistory()
    expect(booking.suggestions).toHaveLength(2)

    // Not offered while changing this week's booking.
    booking.loadBooking(
      { zaloName: 'Lan', count: 1, slots: ['Thứ 2 18h - 20h'], makeup: '', weekLabel: '' },
      '0901234567',
    )
    expect(booking.suggestions).toEqual([])
  })

  it('ignores an answer for a contact that was changed while waiting', async () => {
    const { booking } = await setup()
    booking.form.contact = '0901234567'
    const pending = booking.loadHistory()
    booking.form.contact = '0912345678'
    await pending
    booking.form.contact = '0901234567'
    expect(booking.suggestions).toEqual([])
  })
})
