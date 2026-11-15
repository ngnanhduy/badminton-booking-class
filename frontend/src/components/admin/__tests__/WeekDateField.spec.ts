import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { VueDatePicker } from '@vuepic/vue-datepicker'

import WeekDateField from '../WeekDateField.vue'

function render(startDate: string, label: string) {
  const wrapper = mount(WeekDateField, {
    props: {
      startDate,
      label,
      'onUpdate:startDate': (value: string) => wrapper.setProps({ startDate: value }),
      'onUpdate:label': (value: string) => wrapper.setProps({ label: value }),
    },
  })
  return wrapper
}

/** What the calendar emits when a week is clicked (Monday → Sunday). */
async function pickWeek(wrapper: ReturnType<typeof render>, monday: Date) {
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
  wrapper.findComponent(VueDatePicker).vm.$emit('update:model-value', [monday, sunday])
  await wrapper.vm.$nextTick()
}

const nameInput = (wrapper: ReturnType<typeof render>) =>
  wrapper.find<HTMLInputElement>('input[maxlength="50"]')
const buttonWith = (wrapper: ReturnType<typeof render>, text: string) =>
  wrapper.findAll('button').find((b) => b.text().includes(text))!

describe('WeekDateField', () => {
  it('shows the week in the calendar and names it by its dates', async () => {
    const wrapper = render('2026-11-09', '9/11 - 15/11')
    expect(wrapper.findComponent(VueDatePicker).props('modelValue')).toEqual([
      new Date(2026, 10, 9),
      new Date(2026, 10, 15),
    ])
    await pickWeek(wrapper, new Date(2026, 10, 16))
    expect(wrapper.props('startDate')).toBe('2026-11-16')
    expect(wrapper.props('label')).toBe('16/11 - 22/11')
    expect(wrapper.text()).toContain('16/11 - 22/11')
  })

  it('keeps a custom name when the week changes', async () => {
    const wrapper = render('2026-11-09', 'Tuần đặc biệt')
    expect(nameInput(wrapper).element.value).toBe('Tuần đặc biệt')
    await pickWeek(wrapper, new Date(2026, 10, 16))
    expect(wrapper.props('startDate')).toBe('2026-11-16')
    expect(wrapper.props('label')).toBe('Tuần đặc biệt')

    await buttonWith(wrapper, 'Dùng tên theo ngày').trigger('click')
    expect(wrapper.props('label')).toBe('16/11 - 22/11')
    expect(nameInput(wrapper).exists()).toBe(false)
  })

  it('can rename a week', async () => {
    const wrapper = render('2026-11-09', '9/11 - 15/11')
    expect(nameInput(wrapper).exists()).toBe(false)
    await buttonWith(wrapper, 'Đặt tên khác').trigger('click')
    await nameInput(wrapper).setValue('Tuần thi đấu')
    expect(wrapper.props('label')).toBe('Tuần thi đấu')
  })
})
