import { existsSync, mkdirSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

if (existsSync('.env')) process.loadEnvFile('.env')

const url = process.env.DATABASE_URL
const pgliteDir = process.env.PGLITE_DIR ?? './data/pglite'
if (!url) mkdirSync(pgliteDir, { recursive: true })

// `npm run db:studio` opens a web UI to browse the database:
// the PostgreSQL server in DATABASE_URL, or the embedded PGlite folder when it is unset.
// (Stop the API first when using PGlite: only one process can open it at a time.)
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  ...(url
    ? { dbCredentials: { url } }
    : { driver: 'pglite', dbCredentials: { url: pgliteDir } }),
})
