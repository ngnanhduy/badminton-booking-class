import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import { setLocale } from '@/i18n'
import { parseSlot } from '@/utils/slots'
import SlotOption from '../SlotOption.vue'

const option = parseSlot('Thứ 2 18h - 20h')

function render(props: Partial<InstanceType<typeof SlotOption>['$props']> = {}) {
  return mount(SlotOption, {
    props: { option, selected: false, count: 3, capacity: 8, takenBy: 0, ...props },
  })
}

describe('SlotOption', () => {
  it('shows the time and remaining seats', () => {
    const wrapper = render()
    expect(wrapper.text()).toContain('18h – 20h')
    expect(wrapper.text()).toContain('còn 5 chỗ')
  })

  it('emits the slot value when clicked', async () => {
    const wrapper = render()
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['Thứ 2 18h - 20h']])
  })

  it('is disabled when the slot is full', async () => {
    const wrapper = render({ count: 8 })
    const button = wrapper.get('button')
    expect(button.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Đã đủ người')
  })

  it('is disabled when another session already uses it', () => {
    const wrapper = render({ takenBy: 2 })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Đã chọn cho Buổi 2')
  })

  it('is translated to English, with plurals and 24-hour times', async () => {
    setLocale('en')
    const wrapper = render({ count: 7 })
    expect(wrapper.text()).toContain('18:00 – 20:00')
    expect(wrapper.text()).toContain('Evening · 1 place left')
    expect(render({ count: 3 }).text()).toContain('5 places left')
    expect(render({ takenBy: 2 }).text()).toContain('Chosen for session 2')
  })

  it('stays clickable when selected, even if full', () => {
    const wrapper = render({ count: 8, selected: true })
    const button = wrapper.get('button')
    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.attributes('aria-pressed')).toBe('true')
  })
})
