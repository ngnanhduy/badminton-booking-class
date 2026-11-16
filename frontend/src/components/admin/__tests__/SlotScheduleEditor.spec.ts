import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { mount } from '@vue/test-utils'

import { draftsFromSlots, slotsFromDrafts } from '@/utils/slotEditor'
import TimeInput from '@/components/ui/TimeInput.vue'
import SlotScheduleEditor from '../SlotScheduleEditor.vue'

function render() {
  const MON = ['Thứ 2 18h - 20h']
  const drafts = reactive(draftsFromSlots({ slots1: MON, slots2: MON, slots3: MON }))
  const wrapper = mount(SlotScheduleEditor, {
    props: { modelValue: drafts, counts: {}, issues: {} },
  })
  const button = (text: string) => wrapper.findAll('button').find((b) => b.text() === text)!
  /** The quick-add start and end times are the first two time fields. */
  const setTime = async (index: number, value: string) => {
    wrapper.findAllComponents(TimeInput)[index]!.vm.$emit('update:modelValue', value)
    await wrapper.vm.$nextTick()
  }
  return { wrapper, drafts, button, setTime }
}

describe('SlotScheduleEditor', () => {
  it('adds one time to every chosen day', async () => {
    const { wrapper, drafts, button, setTime } = render()
    await setTime(0, '20:00')
    await setTime(1, '22:00')
    await button('T2').trigger('click')
    await button('T4').trigger('click')
    await button('T6').trigger('click')
    expect(button('T4').attributes('aria-pressed')).toBe('true')

    await button('Thêm vào 3 ngày').trigger('click')
    expect(slotsFromDrafts(drafts).slots1).toEqual([
      'Thứ 2 18h - 20h',
      'Thứ 2 20h - 22h',
      'Thứ 4 20h - 22h',
      'Thứ 6 20h - 22h',
    ])
    expect(wrapper.text()).toContain('Đã thêm 3 ca.')
    // Days are cleared for the next batch.
    expect(button('T4').attributes('aria-pressed')).toBe('false')
  })

  it('selects the whole week and keeps slots a day already has', async () => {
    const { wrapper, drafts, button } = render()
    await button('Cả tuần').trigger('click')
    // Session 1 only: turn off sessions 2 and 3 (the first toggles are the quick-add ones).
    await wrapper.get('[aria-label="Buổi 2"]').trigger('click')
    await wrapper.get('[aria-label="Buổi 3"]').trigger('click')
    await button('Thêm vào 7 ngày').trigger('click')
    expect(drafts).toHaveLength(7)
    expect(wrapper.text()).toContain('Đã thêm 6 ca. 1 ngày đã có ca này')
  })

  it('has a make-up toggle next to sessions 1, 2, 3 on each slot', async () => {
    const { wrapper, drafts } = render()
    // The first one belongs to the quick-add form, the second to Monday's slot.
    const toggles = wrapper.findAll('[data-testid="makeup-toggle"]')
    expect(toggles).toHaveLength(2)
    expect(toggles[1]!.text()).toBe('Bù')
    expect(toggles[1]!.attributes('aria-pressed')).toBe('false')
    await toggles[1]!.trigger('click')
    expect(toggles[1]!.attributes('aria-pressed')).toBe('true')
    expect(slotsFromDrafts(drafts).slotsMakeup).toEqual(['Thứ 2 18h - 20h'])
  })

  it("can't add until a day is chosen and the time is valid", async () => {
    const { wrapper, button, setTime } = render()
    expect(button('Chọn ngày để thêm').attributes('disabled')).toBeDefined()
    await button('T3').trigger('click')
    await setTime(1, '17:00')
    expect(wrapper.text()).toContain('Giờ kết thúc phải sau giờ bắt đầu.')
    expect(button('Thêm vào 1 ngày').attributes('disabled')).toBeDefined()
  })
})
