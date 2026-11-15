/** An option of BaseSelect. */
export interface SelectOption<T extends string = string> {
  value: T
  label: string
  /** Muted text after the label in the list, e.g. "20 học viên". */
  hint?: string
  /** Small pill next to the label, e.g. "Đang mở đăng ký". */
  badge?: string
  badgeTone?: 'brand' | 'amber' | 'muted'
}
