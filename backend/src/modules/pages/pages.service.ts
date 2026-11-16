import { sql } from 'drizzle-orm'
import type { FastifyRequest } from 'fastify'

import type { Db } from '../../db/client.js'
import { PAGES, pageSettings, type Page } from '../../db/schema.js'
import { forbidden } from '../../lib/errors.js'
import { audit } from '../audit/audit.service.js'
import { currentUser } from '../auth/auth.guard.js'

/** Whether each public page is on. */
export type PageFlags = Record<Page, boolean>

const isPage = (value: string): value is Page => (PAGES as readonly string[]).includes(value)

/** Every public page and whether it is on (pages an admin never touched are on). */
export async function getPages(db: Pick<Db, 'select'>): Promise<PageFlags> {
  const flags = Object.fromEntries(PAGES.map((page) => [page, true])) as PageFlags
  for (const row of await db.select().from(pageSettings)) {
    if (isPage(row.page)) flags[row.page] = row.enabled
  }
  return flags
}

/** Turns the given pages on or off; the others keep their state. */
export async function setPages(db: Db, changes: Partial<PageFlags>, by: { actorId: string }) {
  const entries = Object.entries(changes) as [Page, boolean][]
  if (!entries.length) return
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .insert(pageSettings)
      .values(entries.map(([page, enabled]) => ({ page, enabled, updatedAt: now })))
      .onConflictDoUpdate({
        target: pageSettings.page,
        set: { enabled: sql`excluded.enabled`, updatedAt: now },
      })
    await audit(tx, { actor: 'admin', actorId: by.actorId, action: 'pages.update', detail: changes })
  })
}

/**
 * Refuses a public request (403 PAGE_DISABLED) when every page that uses the endpoint is
 * turned off. Signed-in admins pass, so they can still try a page before turning it back on.
 */
export async function requirePage(request: FastifyRequest, ...pages: Page[]) {
  const flags = await getPages(request.server.deps.db)
  if (pages.some((page) => flags[page])) return
  if ((await currentUser(request))?.role === 'admin') return
  throw forbidden('Trang này đang tạm tắt.', 'PAGE_DISABLED')
}
