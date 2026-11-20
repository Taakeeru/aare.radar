# syntax=docker/dockerfile:1
# Multi-stage Next.js build (the pattern of Pandora's client template). Produces a small
# image that runs the standalone server (next.config.ts: output "standalone").
# Built by Pandora's in-house CI from main and pushed to GHCR; the client's
# server only PULLS this image, it never builds (README.md, «Deploy»).
#
# Stage 1 (deps):    node_modules incl. native better-sqlite3 (python3/make/g++).
# Stage 2 (builder): `next build` → .next/standalone/server.js + static.
# Stage 3 (runner):  node:22 alpine + the standalone bundle, non-root uid 1001.

# ── Stage 1: dependencies ───────────────────────────────────────────────────
FROM node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: build ──────────────────────────────────────────────────────────
FROM node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The public address, baked into metadata (canonical base, sitemap, robots).
ARG NEXT_PUBLIC_APP_URL=https://radar.gnamak.ch
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
RUN npm run build

# ── Stage 3: runtime ────────────────────────────────────────────────────────
FROM node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
# The sample data file, the default of RADAR_DATA (lib/radar.ts). Production points RADAR_DATA at a mounted file.
COPY --from=builder --chown=nextjs:nodejs /app/fixtures ./fixtures

# SQLite lives here; mount a volume on it (DATABASE_URL=/app/data/local.db).
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data
ENV DATABASE_URL=/app/data/local.db

USER nextjs
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "server.js"]
