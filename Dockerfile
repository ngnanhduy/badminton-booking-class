# syntax=docker/dockerfile:1
#
# One image for the whole app: the Fastify API also serves the built Vue frontend.
#
#   docker build -t badminton-booking .
#   docker run --env-file backend/.env -e HOST=0.0.0.0 -p 3000:3000 badminton-booking
#
# Configuration (DATABASE_URL, keys, ADMIN_TOKEN…) comes from environment variables at
# runtime — never bake secrets into the image.

ARG NODE_VERSION=24

# ---- 1. Install all dependencies (cached unless a package.json / lockfile changes) ----
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm ci --no-audit --no-fund

# ---- 2. Type-check and build backend + frontend ----
FROM deps AS build
COPY . .
# The frontend calls the API on the same origin (/api/v1), so no API URL is baked in.
RUN npm run build -w backend && npm run build -w frontend

# ---- 3. Production dependencies only (backend workspace) ----
FROM node:${NODE_VERSION}-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
# --omit=optional too: some dev tools (vite, typescript) are also optional peers of runtime
# packages, and npm would otherwise keep them ("devOptional").
RUN npm ci --omit=dev --omit=optional --workspace=backend --include-workspace-root=false \
    --no-audit --no-fund

# ---- 4. Runtime image ----
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STATIC_DIR=/app/public \
    TRUST_PROXY=true
WORKDIR /app

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node backend/package.json ./backend/package.json
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
COPY --from=build --chown=node:node /app/backend/drizzle ./backend/drizzle
COPY --from=build --chown=node:node /app/frontend/dist ./public

# Writable folder for the embedded database (only used when DATABASE_URL is not set).
RUN mkdir -p /app/backend/data && chown node:node /app/backend/data

USER node
WORKDIR /app/backend
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/v1/health" || exit 1

CMD ["node", "dist/server.js"]
