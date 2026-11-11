import { z } from 'zod'

export const SubmitBookingBody = z.object({
  zaloName: z
    .string({ error: 'Vui lòng nhập tên Zalo.' })
    .trim()
    .min(1, 'Vui lòng nhập tên Zalo.')
    .max(100, 'Tên Zalo tối đa 100 ký tự.'),
  contact: z.string({ error: 'Vui lòng nhập số điện thoại hoặc email.' }).max(254),
  count: z.union([z.literal(1), z.literal(2), z.literal(3)], {
    error: 'Vui lòng chọn số buổi tập (1–3).',
  }),
  slots: z.array(z.string().trim().max(100)).max(3),
  makeup: z.string().trim().max(300, 'Ghi chú buổi bù tối đa 300 ký tự.').optional().default(''),
  consent: z.literal(true, {
    error: 'Bạn cần đồng ý với thông báo xử lý dữ liệu cá nhân để đăng ký.',
  }),
})
export type SubmitBookingInput = z.output<typeof SubmitBookingBody>

export const ContactBody = z.object({
  contact: z.string({ error: 'Vui lòng nhập số điện thoại hoặc email.' }).max(254),
})
