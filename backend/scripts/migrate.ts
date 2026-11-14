/** Applies pending database migrations (also done automatically when the API starts). */
import { loadConfig } from '../src/config/env.js'
import { openDatabaseFromConfig } from '../src/db/client.js'

const config = loadConfig()
const database = await openDatabaseFromConfig(config, { migrate: true })
console.log(`Migrations applied (${database.driver}).`)
await database.close()
