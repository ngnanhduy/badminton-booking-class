/** Values interpolated into the error message; returned to clients so they can translate it. */
export type ErrorParams = Record<string, string | number>

/**
 * An error that is safe to show to the user. `code` is stable and is what clients translate
 * (the frontend has English and Vietnamese texts per code); `message` is a Vietnamese default.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly params?: ErrorParams,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const badRequest = (code: string, message: string, params?: ErrorParams) =>
  new AppError(400, code, message, params)
export const unauthorized = (message = 'Vui lòng đăng nhập để tiếp tục.') =>
  new AppError(401, 'UNAUTHORIZED', message)
export const forbidden = (
  message = 'Tài khoản của bạn không có quyền thực hiện thao tác này.',
  code = 'FORBIDDEN',
) => new AppError(403, code, message)
export const notFound = (code: string, message: string, params?: ErrorParams) =>
  new AppError(404, code, message, params)
export const conflict = (code: string, message: string, params?: ErrorParams) =>
  new AppError(409, code, message, params)
