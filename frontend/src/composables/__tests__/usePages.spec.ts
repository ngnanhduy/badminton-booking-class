import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createDemoConfig } from '@/services/mockApi'
import { useAuthStore } from '@/stores/auth'
import { useScheduleStore } from '@/stores/schedule'
import type { PageId } from '@/types/booking'
import { usePages } from '../usePages'

const ALL_ON: Record<PageId, boolean> = {
  booking: true,
  edit: true,
  checkin: true,
  schedule: true,
  members: true,
}

function withPages(pages?: Partial<Record<PageId, boolean>>) {
  useScheduleStore().setConfig({ ...createDemoConfig(), pages: pages && { ...ALL_ON, ...pages } })
}

beforeEach(() => setActivePinia(createPinia()))

describe('usePages', () => {
  it('treats every page as on until the schedule says otherwise (and for older servers)', () => {
    const pages = usePages()
    expect(pages.canView('members')).toBe(true)
    withPages(undefined)
    expect(pages.canView('members')).toBe(true)
  })

  it('hides turned-off pages from students, and the logo leads to the first page on', () => {
    withPages({ booking: false, edit: false, members: false })
    const pages = usePages()
    expect(pages.isEnabled('members')).toBe(false)
    expect(pages.canView('members')).toBe(false)
    expect(pages.canView('schedule')).toBe(true)
    expect(pages.home.value).toBe('checkin')
  })

  it('still shows turned-off pages to admins', () => {
    withPages({ booking: false, members: false })
    const auth = useAuthStore()
    auth.user = { id: 'u1', email: 'coach@example.com', name: 'Coach', role: 'admin' }
    const pages = usePages()
    expect(pages.isEnabled('members')).toBe(false)
    expect(pages.canView('members')).toBe(true)
    expect(pages.home.value).toBe('booking')
  })
})
