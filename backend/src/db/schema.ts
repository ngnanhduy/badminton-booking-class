import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Class settings — a single row (id = 1). Contains no personal data, so it is stored in
 * plain text and can be edited directly in any PostgreSQL tool or via the admin API.
 */
export const settings = pgTable(
  'settings',
  {
    id: smallint('id').primaryKey().default(1),
    weekLabel: text('week_label').notNull(),
    rules: jsonb('rules').$type<string[]>().notNull(),
    slots1: jsonb('slots1').$type<string[]>().notNull(),
    slots2: jsonb('slots2').$type<string[]>().notNull(),
    capacity: integer('capacity'),
    open: boolean('open').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('settings_singleton', sql`${t.id} = 1`),
    check('settings_capacity_positive', sql`${t.capacity} IS NULL OR ${t.capacity} > 0`),
  ],
)

/**
 * One row per student per week.
 *
 * Personal data columns (*_enc) are AES-256-GCM ciphertext. *_hash columns are keyed
 * HMAC blind indexes used for lookups and uniqueness — they cannot be reversed.
 * Slot labels are not personal data and stay readable so counts can be computed in SQL.
 */
export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey(),
    weekLabel: text('week_label').notNull(),
    nameEnc: text('name_enc').notNull(),
    nameHash: text('name_hash').notNull(),
    contactEnc: text('contact_enc').notNull(),
    contactHash: text('contact_hash').notNull(),
    sessionCount: smallint('session_count').notNull(),
    slot1: text('slot1').notNull(),
    slot2: text('slot2'),
    slot3: text('slot3'),
    makeupEnc: text('makeup_enc'),
    /** Version of the privacy notice the student agreed to, and when (consent record). */
    consentVersion: text('consent_version').notNull(),
    consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bookings_week_contact_uq').on(t.weekLabel, t.contactHash),
    index('bookings_week_name_idx').on(t.weekLabel, t.nameHash),
    index('bookings_updated_at_idx').on(t.updatedAt),
    check('bookings_session_count_range', sql`${t.sessionCount} BETWEEN 1 AND 3`),
  ],
)

/**
 * Processing log (who did what, when) — required evidence for data-protection
 * accountability. Never stores personal data: only ids, actions and counts.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actor: text('actor').notNull(), // 'student' | 'user' | 'admin' | 'system'
    /** Pseudonymous id of who acted: a users.id, 'token' (ADMIN_TOKEN), or null. */
    actorId: text('actor_id'),
    action: text('action').notNull(), // e.g. 'booking.create', 'booking.delete'
    bookingId: uuid('booking_id'),
    weekLabel: text('week_label'),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
  },
  (t) => [index('audit_logs_at_idx').on(t.at)],
)

/**
 * Roles that can sign in. Only admins for now; to add one (e.g. 'coach'), extend this list,
 * the CHECK constraint (new migration) and the route guards.
 */
export const ROLES = ['admin'] as const
export type Role = (typeof ROLES)[number]

/**
 * Staff accounts (email + password). The email is AES-256-GCM ciphertext plus a keyed HMAC
 * for lookup at login; the password is a scrypt hash. Students don't have accounts.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    emailHash: text('email_hash').notNull(),
    emailEnc: text('email_enc').notNull(),
    nameEnc: text('name_enc').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').$type<Role>().notNull().default('admin'),
    /** Consecutive failed logins; reaching the limit locks the account until `lockedUntil`. */
    failedLogins: smallint('failed_logins').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_email_hash_uq').on(t.emailHash),
    check('users_role_valid', sql`${t.role} IN ('admin')`),
  ],
)

/** Signed-in browser sessions. `id` is the SHA-256 of the cookie token, never the token. */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_at_idx').on(t.expiresAt)],
)

export type BookingRow = typeof bookings.$inferSelect
export type UserRow = typeof users.$inferSelect
export type SettingsRow = typeof settings.$inferSelect
