#!/bin/sh
# Vercel build: compile the API, migrate the database (production only), build the frontend.
set -e

npm run build -w backend

# Only production deployments touch the database schema, so a preview of an unfinished
# branch can never change the live tables. Preview deployments with their own
# DATABASE_URL can opt in with MIGRATE_ON_BUILD=true.
if [ "$VERCEL_ENV" = "production" ] || [ "$MIGRATE_ON_BUILD" = "true" ]; then
  echo "Applying database migrations..."
  npm run db:migrate -w backend
else
  echo "Skipping database migrations (VERCEL_ENV=$VERCEL_ENV)."
fi

npm run build -w frontend
