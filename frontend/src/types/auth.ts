/** Roles that can sign in (students don't have accounts). Labels: `roles.<role>` in i18n. */
export type Role = 'admin'

/** The signed-in staff account, as returned by `GET /api/v1/auth/me`. */
export interface AuthUser {
  id: string
  email: string
  name: string
  role: Role
}
