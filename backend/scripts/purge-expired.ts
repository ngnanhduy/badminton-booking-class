/** Deletes bookings older than RETENTION_DAYS (the API also does this every 12 hours). */
import { keyringFromConfig, loadConfig } from '../src/config/env.js'
import { openDatabaseFromConfig } from '../src/db/client.js'
import { purgeExpiredBookings } from '../src/modules/bookings/booking.service.js'

const config = loadConfig()
const database = await openDatabaseFromConfig(config)
const deleted = await purgeExpiredBookings(
  { db: database.db, keyring: keyringFromConfig(config), config },
  'admin',
)
console.log(`Deleted ${deleted} booking(s) older than ${config.RETENTION_DAYS} days.`)
await database.close()
