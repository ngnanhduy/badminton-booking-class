import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, asc, count, eq, gt, lt, ne } from 'drizzle-orm'

import { sessions, users, type Role, type UserRow } from '../../db/schema.js'
import { blindIndex, decrypt, encrypt, type Keyring } from '../../lib/crypto.js'
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.js'
import { dummyPasswordHash, generatePassword, hashPassword, verifyPassword } from '../../lib/password.js'
import type { AppDeps } from '../../types.js'
import { audit } from '../audit/audit.service.js'

/** Failed logins before an account is locked, and for how long. */
export const MAX_FAILED_LOGINS = 5
export const LOCK_MINUTES = 15

/** A signed-in user, as seen by route handlers. */
export interface SessionUser {
  id: string
  email: string
  name: string
  role: Role
  /** Hash of the session token (sessions.id). */
  sessionId: string
}

export interface UserView {
  id: string
  email: string
  name: string
  role: Role
  createdAt: string
  lastLoginAt: string | null
}

type Actor = { actor: 'admin' | 'system'; actorId: string | null }

const aad = (userId: string, field: 'email' | 'name') => `user:${userId}:${field}`

export const normalizeEmail = (email: string) => email.trim().toLowerCase()
export const emailIndex = (keyring: Keyring, email: string) =>
  blindIndex(keyring, 'user-email', normalizeEmail(email))
export const hashSessionToken = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('base64url')

function toView(keyring: Keyring, row: UserRow): UserView {
  return {
    id: row.id,
    email: decrypt(keyring, row.emailEnc, aad(row.id, 'email')),
    name: decrypt(keyring, row.nameEnc, aad(row.id, 'name')),
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  }
}

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.')

/** Creates a staff account. Without a password, a random one is generated and returned once. */
export async function createUser(
  deps: AppDeps,
  input: { email: string; name: string; password?: string; role?: Role },
  by: Actor,
) {
  const { db, keyring } = deps
  const email = normalizeEmail(input.email)
  const emailHash = emailIndex(keyring, email)
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.emailHash, emailHash))
  if (existing) throw conflict('EMAIL_TAKEN', 'Email này đã có tài khoản.')

  const password = input.password ?? generatePassword()
  const id = randomUUID()
  const [row] = await db
    .insert(users)
    .values({
      id,
      emailHash,
      emailEnc: encrypt(keyring, email, aad(id, 'email')),
      nameEnc: encrypt(keyring, input.name.trim(), aad(id, 'name')),
      passwordHash: await hashPassword(password),
      role: input.role ?? 'admin',
    })
    .returning()
  await audit(db, { ...by, action: 'user.create', detail: { userId: id, role: row!.role } })
  return { user: toView(keyring, row!), temporaryPassword: input.password ? undefined : password }
}

/**
 * Checks an email + password. Unknown emails take as long as known ones; repeated failures
 * lock the account for LOCK_MINUTES.
 */
export async function authenticate(deps: AppDeps, email: string, password: string) {
  const { db, keyring } = deps
  const [row] = await db.select().from(users).where(eq(users.emailHash, emailIndex(keyring, email)))
  if (!row) {
    await verifyPassword(password, await dummyPasswordHash())
    throw invalidCredentials()
  }

  const now = new Date()
  if (row.lockedUntil && row.lockedUntil > now) {
    const minutes = Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 60_000)
    throw new AppError(
      429,
      'ACCOUNT_LOCKED',
      `Tài khoản tạm khoá do đăng nhập sai nhiều lần. Thử lại sau ${minutes} phút.`,
      { minutes },
    )
  }

  if (!(await verifyPassword(password, row.passwordHash))) {
    const failed = row.failedLogins + 1
    const lock = failed >= MAX_FAILED_LOGINS
    await db
      .update(users)
      .set({
        failedLogins: lock ? 0 : failed,
        lockedUntil: lock ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : row.lockedUntil,
      })
      .where(eq(users.id, row.id))
    await audit(db, {
      actor: 'admin',
      actorId: row.id,
      action: lock ? 'auth.locked' : 'auth.login_failed',
      detail: { failed },
    })
    throw invalidCredentials()
  }

  await db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: now }).where(eq(users.id, row.id))
  await audit(db, { actor: 'admin', actorId: row.id, action: 'auth.login' })
  return toView(keyring, row)
}

/** Starts a session; returns the raw token for the cookie (only its hash is stored). */
export async function createSession(deps: AppDeps, userId: string) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + deps.config.SESSION_TTL_HOURS * 60 * 60 * 1000)
  await deps.db.insert(sessions).values({ id: hashSessionToken(token), userId, expiresAt })
  return { token, expiresAt }
}

/** Resolves a session cookie token to its user. The role is read fresh on every request. */
export async function findSessionUser(deps: AppDeps, token: string): Promise<SessionUser | null> {
  const sessionId = hashSessionToken(token)
  const [row] = await deps.db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
  if (!row) return null
  const view = toView(deps.keyring, row.user)
  return { id: view.id, email: view.email, name: view.name, role: view.role, sessionId }
}

export async function deleteSession(deps: AppDeps, sessionId: string) {
  await deps.db.delete(sessions).where(eq(sessions.id, sessionId))
}

/** Changes the signed-in user's password and signs out their other sessions. */
export async function changePassword(
  deps: AppDeps,
  user: SessionUser,
  currentPassword: string,
  newPassword: string,
) {
  const [row] = await deps.db.select().from(users).where(eq(users.id, user.id))
  if (!row || !(await verifyPassword(currentPassword, row.passwordHash))) {
    throw new AppError(400, 'WRONG_PASSWORD', 'Mật khẩu hiện tại không đúng.')
  }
  await deps.db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() })
    .where(eq(users.id, user.id))
  await deps.db
    .delete(sessions)
    .where(and(eq(sessions.userId, user.id), ne(sessions.id, user.sessionId)))
  await audit(deps.db, { actor: 'admin', actorId: user.id, action: 'user.password_change' })
}

/** Sets a new random password (admin action or CLI); signs the account out everywhere. */
export async function resetPassword(deps: AppDeps, userId: string, by: Actor) {
  const password = generatePassword()
  const updated = await deps.db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      passwordChangedAt: new Date(),
      failedLogins: 0,
      lockedUntil: null,
    })
    .where(eq(users.id, userId))
    .returning({ id: users.id })
  if (!updated.length) throw notFound('USER_NOT_FOUND', 'Không tìm thấy tài khoản.')
  await deps.db.delete(sessions).where(eq(sessions.userId, userId))
  await audit(deps.db, { ...by, action: 'user.password_reset', detail: { userId } })
  return password
}

export async function findUserIdByEmail(deps: AppDeps, email: string) {
  const [row] = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.emailHash, emailIndex(deps.keyring, email)))
  return row?.id ?? null
}

export async function listUsers(deps: AppDeps): Promise<UserView[]> {
  const rows = await deps.db.select().from(users).orderBy(asc(users.createdAt))
  return rows.map((row) => toView(deps.keyring, row))
}

/** Deletes an account (and its sessions). The last admin can't be deleted. */
export async function deleteUser(deps: AppDeps, userId: string, by: Actor) {
  if (by.actorId === userId) {
    throw forbidden('Bạn không thể xoá tài khoản của chính mình.', 'CANNOT_DELETE_SELF')
  }
  const [{ admins } = { admins: 0 }] = await deps.db
    .select({ admins: count() })
    .from(users)
    .where(eq(users.role, 'admin'))
  if (admins <= 1) throw conflict('LAST_ADMIN', 'Không thể xoá quản trị viên cuối cùng.')
  const deleted = await deps.db.delete(users).where(eq(users.id, userId)).returning({ id: users.id })
  if (!deleted.length) throw notFound('USER_NOT_FOUND', 'Không tìm thấy tài khoản.')
  await audit(deps.db, { ...by, action: 'user.delete', detail: { userId } })
}

export async function purgeExpiredSessions(deps: AppDeps) {
  const deleted = await deps.db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id })
  return deleted.length
}
