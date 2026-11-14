#!/bin/sh
# Vercel build: compile the API, migrate the database (production only), build the frontend.
set -e

# Same fallback as the backend: the Vercel ↔ Supabase integration provides POSTGRES_URL.
export DATABASE_URL="${DATABASE_URL:-$POSTGRES_URL}"

npm run build -w backend

# Only production deployments touch the database schema, so a preview of an unfinished
# branch can never change the live tables. Preview deployments with their own
# DATABASE_URL can opt in with MIGRATE_ON_BUILD=true.
if [ "$VERCEL_ENV" = "production" ] || [ "$MIGRATE_ON_BUILD" = "true" ]; then
  # Catch the usual DATABASE_URL mistakes with a clear message instead of a network error.
  case "$DATABASE_URL" in
    "")
      echo "ERROR: neither DATABASE_URL nor POSTGRES_URL is set for this environment (Vercel → Settings → Environment Variables)." >&2
      exit 1 ;;
    *REPLACE-WITH*)
      echo "ERROR: DATABASE_URL still contains a placeholder host. Use Supabase → Connect → Transaction pooler." >&2
      exit 1 ;;
    *@db.*.supabase.co*)
      echo "ERROR: DATABASE_URL is Supabase's direct connection (IPv6 only, unreachable from Vercel)." >&2
      echo "       Use Supabase → Connect → Transaction pooler (…pooler.supabase.com:6543) instead." >&2
      exit 1 ;;
  esac
  echo "Applying database migrations..."
  npm run db:migrate -w backend
else
  echo "Skipping database migrations (VERCEL_ENV=$VERCEL_ENV)."
fi

npm run build -w frontend
