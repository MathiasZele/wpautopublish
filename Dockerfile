# syntax=docker/dockerfile:1

# ---- Base ----
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate

# ---- Build ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Dummy values let `next build` compile without real secrets.
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DIRECT_URL="postgresql://build:build@localhost:5432/build"
ENV NEXTAUTH_SECRET="build-placeholder-not-a-real-secret"
ENV NEXTAUTH_URL="http://localhost:3000"
ENV ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
ENV OPENAI_API_KEY="sk-build-placeholder"
ENV REDIS_URL="redis://localhost:6379"
ENV EVOLUTION_API_URL="http://localhost:8080"
ENV EVOLUTION_API_KEY="build-placeholder"
ENV EVOLUTION_WEBHOOK_SECRET="build-placeholder"
ENV EVOLUTION_INSTANCE_NAME="build"
ENV AUTH_TRUST_HOST="true"

RUN mkdir -p public
RUN npm run build

# ---- Production ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Standalone output: only the necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/workers ./workers
COPY --from=builder /app/lib ./lib
# Prisma CLI (pinned v5 from lockfile) for runtime migrate deploy
COPY --from=deps /app/node_modules/prisma ./node_modules/prisma
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node server.js"]
