# syntax=docker/dockerfile:1

# ---- Base ----
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package.json package-lock.json ./
# npm ci may fail on cross-platform optional deps (@emnapi/*).
# --prefer-offline + frozen lockfile intent: if ci fails, fall back to install.
RUN npm ci || npm install --prefer-offline
COPY prisma ./prisma
RUN npx prisma generate

# ---- Build ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js server-side process.env.* are resolved at RUNTIME, not build time.
# Only NEXT_PUBLIC_* would be inlined — this project has none.
# Dummy values let `next build` compile without real secrets.
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DIRECT_URL="postgresql://build:build@localhost:5432/build"
ENV NEXTAUTH_SECRET="build-placeholder-not-a-real-secret"
ENV NEXTAUTH_URL="http://localhost:3000"
ENV ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

RUN npm run build

# ---- Production ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy build output and runtime dependencies
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/workers ./workers
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# All secrets are injected by Railway as runtime env vars.
# No ARG or ENV needed for sensitive data.
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start"]
