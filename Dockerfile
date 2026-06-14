# ── Build Stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
COPY packages/client ./packages/client

# Build shared first, then server and client
RUN pnpm --filter shared build
RUN pnpm --filter server build
RUN pnpm --filter client build

# ── Production Stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS production
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Only install production deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/

RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist

# Copy built client into server's public directory
COPY --from=builder /app/packages/client/dist ./packages/server/dist/public

# Data directory for SQLite + uploads
RUN mkdir -p /data/uploads

EXPOSE 3001

CMD ["node", "packages/server/dist/index.js"]
