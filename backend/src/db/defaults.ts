/** Slots offered for sessions 2, 3 and make-up classes of the first week (they can differ later). */
const LATER_SESSION_SLOTS = [
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
]

/** Slots, rules and capacity of the first week, created when the database has no weeks. */
export const DEFAULT_WEEK = {
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
  slots2: LATER_SESSION_SLOTS,
  slots3: LATER_SESSION_SLOTS,
  slotsMakeup: LATER_SESSION_SLOTS,
  capacity: 8 as number | null,
}
