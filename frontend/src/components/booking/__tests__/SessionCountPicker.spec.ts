import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import SessionCountPicker from '../SessionCountPicker.vue'

describe('SessionCountPicker', () => {
  it('renders 1, 2 and 3 session options', () => {
    const wrapper = mount(SessionCountPicker, { props: { modelValue: null } })
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(3)
  })

  it('emits the chosen number of sessions', async () => {
    const wrapper = mount(SessionCountPicker, { props: { modelValue: null } })
    await wrapper.get('[data-testid="session-count-2"]').setValue(true)
    expect(wrapper.emitted('update:modelValue')).toEqual([[2]])
  })

  it('reflects the current value', () => {
    const wrapper = mount(SessionCountPicker, { props: { modelValue: 3 } })
    const input = wrapper.get<HTMLInputElement>('[data-testid="session-count-3"]')
    expect(input.element.checked).toBe(true)
  })
})
