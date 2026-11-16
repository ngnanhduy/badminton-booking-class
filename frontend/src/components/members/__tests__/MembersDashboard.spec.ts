import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ApiError } from '@/services/errors'
import { useAuthStore } from '@/stores/auth'
import type { MemberList } from '@/types/booking'
import MembersDashboard from '../MembersDashboard.vue'

const PHONE = '0912345678'

/** The members list, with the phone number only when the admin endpoint answers. */
const list = (withContact: boolean): MemberList => ({
  weekLabel: '16/11 - 22/11',
  weeks: [
    {
      weekLabel: '16/11 - 22/11',
      startDate: '2026-11-16',
      status: 'open',
      current: true,
      bookings: 1,
    },
  ],
  attendance: { present: 0, absent: 0 },
  members: [
    {
      zaloName: 'Minh Anh',
      ...(withContact && { contact: PHONE }),
      weeks: 1,
      sessions: 1,
      week: { count: 1, slots: ['Thứ 2 18h - 20h'] },
      lastWeekLabel: '16/11 - 22/11',
      firstBookedAt: '2026-11-16T00:00:00Z',
      lastBookedAt: '2026-11-16T00:00:00Z',
      attended: 0,
      absent: 0,
    },
  ],
})

const server = vi.hoisted(() => ({
  publicList: vi.fn<(week?: string) => Promise<MemberList>>(),
  adminList: vi.fn<(week?: string) => Promise<MemberList>>(),
}))

vi.mock('@/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/api')>()),
  api: { listMembers: server.publicList },
}))
vi.mock('@/services/admin', () => ({ adminApi: { listMembers: server.adminList } }))

let pinia: Pinia

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  server.publicList.mockReset().mockImplementation(async () => list(false))
  server.adminList.mockReset().mockImplementation(async () => list(true))
})

function signIn() {
  const auth = useAuthStore()
  auth.user = { id: 'u1', email: 'coach@example.com', name: 'Coach', role: 'admin' }
  auth.loaded = true
  return auth
}

async function mountDashboard() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/hoc-vien', name: 'members', component: { render: () => null } }],
  })
  await router.push('/hoc-vien')
  await router.isReady()
  const wrapper = mount(MembersDashboard, { global: { plugins: [router, pinia] } })
  await flushPromises()
  return wrapper
}

const contactsButton = (wrapper: Awaited<ReturnType<typeof mountDashboard>>) =>
  wrapper.findAll('button').find((b) => /SĐT \/ email/.test(b.text()))

describe('MembersDashboard week roster', () => {
  const member = (zaloName: string, slots: string[]) => ({
    ...list(false).members[0]!,
    zaloName,
    week: { count: slots.length, slots },
  })

  it('lists each student once with their whole week, and filters by day', async () => {
    server.publicList.mockImplementation(async () => ({
      ...list(false),
      members: [
        member('Minh Anh', ['Thứ 4 18h - 20h', 'Thứ 2 18h - 20h']),
        member('Lan', ['Thứ 4 18h - 20h']),
      ],
    }))
    const wrapper = await mountDashboard()

    const rows = () => wrapper.findAll('li').map((li) => li.text())
    expect(rows()).toHaveLength(2)
    expect(wrapper.text().match(/Minh Anh/g)).toHaveLength(1)
    expect(wrapper.text()).toContain('Đã đăng ký: T2 · 18h – 20h, T4 · 18h – 20h')

    const chip = wrapper.findAll('[role="group"] button').find((b) => b.text().startsWith('T2'))!
    await chip.trigger('click')
    expect(chip.attributes('aria-pressed')).toBe('true')
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toContain('Minh Anh')
  })
})

describe('MembersDashboard phone / email (admins only)', () => {
  it('has no button for visitors, who only get the public list', async () => {
    const wrapper = await mountDashboard()

    expect(wrapper.text()).toContain('Minh Anh')
    expect(contactsButton(wrapper)).toBeUndefined()
    expect(server.adminList).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain(PHONE)
  })

  it('shows them to an admin from the admin API, and forgets them when hidden', async () => {
    signIn()
    const wrapper = await mountDashboard()
    expect(wrapper.text()).not.toContain(PHONE)

    const button = contactsButton(wrapper)!
    expect(button.text()).toBe('Hiện SĐT / email')
    expect(button.attributes('aria-pressed')).toBe('false')
    await button.trigger('click')
    await flushPromises()

    expect(server.adminList).toHaveBeenCalledWith(undefined)
    expect(wrapper.text()).toContain(PHONE)
    expect(contactsButton(wrapper)!.text()).toBe('Ẩn SĐT / email')
    expect(contactsButton(wrapper)!.attributes('aria-pressed')).toBe('true')

    // Search finds them by phone number too, typed with spaces.
    await wrapper.get('input[type="search"]').setValue('0912 345')
    expect(wrapper.text()).toContain('Minh Anh')
    await wrapper.get('input[type="search"]').setValue('')

    // Hidden at once, before the public list comes back.
    server.publicList.mockImplementation(() => new Promise(() => {}))
    await contactsButton(wrapper)!.trigger('click')
    expect(wrapper.text()).not.toContain(PHONE)
    expect(wrapper.text()).toContain('Minh Anh')
  })

  it('hides them when the admin signs out', async () => {
    const auth = signIn()
    const wrapper = await mountDashboard()
    await contactsButton(wrapper)!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(PHONE)

    auth.user = null
    await flushPromises()
    expect(wrapper.text()).not.toContain(PHONE)
    expect(contactsButton(wrapper)).toBeUndefined()
  })

  it('goes back to the public list when the admin API refuses (e.g. session expired)', async () => {
    signIn()
    server.adminList.mockRejectedValue(
      new ApiError('Vui lòng đăng nhập để tiếp tục.', 401, 'UNAUTHORIZED'),
    )
    const wrapper = await mountDashboard()
    await contactsButton(wrapper)!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain(PHONE)
    expect(wrapper.text()).toContain('Vui lòng đăng nhập để tiếp tục.')
    expect(contactsButton(wrapper)!.text()).toBe('Hiện SĐT / email')
  })
})
