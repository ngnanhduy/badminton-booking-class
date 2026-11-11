/**
 * Exports bookings to a decrypted CSV in backend/exports/ (git-ignored).
 *
 *   npm run export:bookings -w backend                 → current week, without contacts
 *   npm run export:bookings -w backend -- --contacts   → include phone/email
 *   npm run export:bookings -w backend -- --week "9/11 - 15/11"
 *
 * The export contains personal data: store it securely and delete it when done.
 * Each export is recorded in the audit log.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { desc, eq } from 'drizzle-orm'

import { keyringFromConfig, loadConfig } from '../src/config/env.js'
import { openDatabaseFromConfig } from '../src/db/client.js'
import { bookings } from '../src/db/schema.js'
import { audit } from '../src/modules/audit/audit.service.js'
import { decryptBooking, decryptContact } from '../src/modules/bookings/booking.service.js'
import { getSettings } from '../src/modules/schedule/schedule.service.js'

const { values: args } = parseArgs({
  options: { week: { type: 'string' }, contacts: { type: 'boolean', default: false } },
})

const config = loadConfig()
const keyring = keyringFromConfig(config)
const database = await openDatabaseFromConfig(config)
const { db } = database

const week = args.week ?? (await getSettings(db)).weekLabel
const rows = await db
  .select()
  .from(bookings)
  .where(eq(bookings.weekLabel, week))
  .orderBy(desc(bookings.createdAt))

const csvCell = (v: unknown) => {
  let s = String(v ?? '')
  if (/^[=+\-@]/.test(s)) s = `'${s}` // prevent formula injection when opened in Excel
  return `"${s.replace(/"/g, '""')}"`
}

const header = ['Tuần', 'Tên Zalo', ...(args.contacts ? ['Liên hệ'] : []), 'Số buổi', 'Buổi 1', 'Buổi 2', 'Buổi 3', 'Buổi bù', 'Đồng ý (phiên bản)', 'Đồng ý lúc', 'Cập nhật']
const lines = rows.map((row) => {
  const b = decryptBooking(keyring, row)
  return [
    b.weekLabel,
    b.zaloName,
    ...(args.contacts ? [decryptContact(keyring, row)] : []),
    b.count,
    b.slots[0],
    b.slots[1],
    b.slots[2],
    b.makeup,
    b.consentVersion,
    b.consentAt,
    b.updatedAt,
  ]
    .map(csvCell)
    .join(',')
})

mkdirSync('exports', { recursive: true })
const file = `exports/bookings-${week.replace(/[^\w-]+/g, '_')}-${Date.now()}.csv`
// BOM so Excel opens Vietnamese text correctly.
writeFileSync(file, '﻿' + [header.map(csvCell).join(','), ...lines].join('\r\n'), { mode: 0o600 })
await audit(db, {
  actor: 'admin',
  action: args.contacts ? 'admin.export_with_contact' : 'admin.export',
  weekLabel: week,
  detail: { rows: rows.length },
})
await database.close()

console.log(`Exported ${rows.length} booking(s) to backend/${file}`)
console.log('This file contains personal data — keep it private and delete it when no longer needed.')
