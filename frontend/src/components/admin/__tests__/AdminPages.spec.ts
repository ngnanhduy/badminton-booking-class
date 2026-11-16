import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import { PAGES } from '@/config/pages'
import { ApiError } from '@/services/errors'
import { createDemoConfig } from '@/services/mockApi'
import { useScheduleStore } from '@/stores/schedule'
import type { PageId, ScheduleConfig } from '@/types/booking'
import AdminPages from '../AdminPages.vue'

type Flags = Record<PageId, boolean>
const ALL_ON: Flags = { booking: true, edit: true, checkin: true, schedule: true, members: true }
const configWith = (pages: Partial<Flags>): ScheduleConfig => ({
  ...createDemoConfig(),
  pages: { ...ALL_ON, ...pages },
})

const server = vi.hoisted(() => ({
  updatePages: vi.fn<(changes: Partial<Record<string, boolean>>) => Promise<ScheduleConfig>>(),
}))
vi.mock('@/services/admin', () => ({ adminApi: { updatePages: server.updatePages } }))

let pinia: Pinia

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  server.updatePages.mockReset()
})

async function mountPages(pages: Partial<Flags> = {}) {
  useScheduleStore().setConfig(configWith(pages))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'admin', component: { render: () => null } },
      ...PAGES.map((p) => ({ path: `/${p.id}`, name: p.id, component: { render: () => null } })),
    ],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(AdminPages, { global: { plugins: [router, pinia] } })
  await flushPromises()
  return wrapper
}

const row = (wrapper: Awaited<ReturnType<typeof mountPages>>, page: PageId) =>
  wrapper.get(`[data-testid=page-${page}]`)
const switchOf = (wrapper: Awaited<ReturnType<typeof mountPages>>, page: PageId) =>
  row(wrapper, page).get<HTMLInputElement>('input[role=switch]')

describe('AdminPages', () => {
  it('shows each page with its state', async () => {
    const wrapper = await mountPages({ checkin: false })
    expect(switchOf(wrapper, 'booking').element.checked).toBe(true)
    expect(switchOf(wrapper, 'checkin').element.checked).toBe(false)
    expect(row(wrapper, 'checkin').text()).toContain('Đang tắt')
    expect(wrapper.text()).toContain('Đang bật 4/5 trang')
  })

  it('saves only the page switched, and updates the schedule', async () => {
    server.updatePages.mockImplementation(async (changes) => configWith(changes))
    const wrapper = await mountPages()

    await switchOf(wrapper, 'members').setValue(false)
    expect(server.updatePages).toHaveBeenCalledWith({ members: false })
    await flushPromises()

    expect(useScheduleStore().config?.pages?.members).toBe(false)
    expect(row(wrapper, 'members').text()).toContain('Đang tắt')
    expect(wrapper.text()).toContain('Đang bật 4/5 trang')
  })

  it('puts the switch back and shows the error when saving fails', async () => {
    server.updatePages.mockRejectedValue(new ApiError('x', 500, 'INTERNAL'))
    const wrapper = await mountPages()

    await switchOf(wrapper, 'checkin').setValue(false)
    await flushPromises()

    expect(switchOf(wrapper, 'checkin').element.checked).toBe(true)
    expect(useScheduleStore().config?.pages?.checkin).toBe(true)
    expect(wrapper.text()).toContain('Máy chủ gặp lỗi')
  })

  it('warns what turning off the edit page means for students', async () => {
    const wrapper = await mountPages({ edit: false })
    expect(row(wrapper, 'edit').text()).toContain('xem hoặc xoá đăng ký')
    expect(row(wrapper, 'members').find('[role=status]').exists()).toBe(false)
  })
})
