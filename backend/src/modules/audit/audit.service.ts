import { desc } from 'drizzle-orm'

import type { Db } from '../../db/client.js'
import { auditLogs } from '../../db/schema.js'

export type AuditActor = 'student' | 'user' | 'admin' | 'system'

/** Records a processing activity. Never pass personal data in `detail`. */
export async function audit(
  db: Pick<Db, 'insert'>,
  entry: {
    actor: AuditActor
    /** users.id of the signed-in actor, or 'token' for ADMIN_TOKEN. Never an email. */
    actorId?: string | null
    action: string
    bookingId?: string | null
    weekLabel?: string | null
    detail?: Record<string, unknown>
  },
) {
  await db.insert(auditLogs).values({
    actor: entry.actor,
    actorId: entry.actorId ?? null,
    action: entry.action,
    bookingId: entry.bookingId ?? null,
    weekLabel: entry.weekLabel ?? null,
    detail: entry.detail ?? null,
  })
}

export async function listAuditLogs(db: Db, limit = 100) {
  return db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(limit)
}
