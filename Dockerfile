FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat vips-dev build-base
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild Sharp for Alpine Linux
RUN npm rebuild sharp

# Production-only node_modules for the runner (the custom server.js runs
# Next in full mode, not the standalone bundle, so it needs real deps).
FROM base AS prod-deps
RUN apk add --no-cache libc6-compat vips-dev build-base
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Rebuild Sharp for Alpine Linux
RUN npm rebuild sharp

FROM base AS builder
RUN apk add --no-cache vips-dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so
# they must arrive as Docker build args (Dokploy: mark env vars as
# build-time / pass them as build args).
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID
ARG NEXT_PUBLIC_GTM_ID
ARG NEXT_PUBLIC_CLARITY_PROJECT_ID
ARG NEXT_PUBLIC_KEY_SEQUENCE
ARG NEXT_PUBLIC_CGR
ARG NEXT_PUBLIC_BR
ARG NEXT_PUBLIC_RACE_SERVER
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_GA_MEASUREMENT_ID=$NEXT_PUBLIC_GA_MEASUREMENT_ID \
    NEXT_PUBLIC_GTM_ID=$NEXT_PUBLIC_GTM_ID \
    NEXT_PUBLIC_CLARITY_PROJECT_ID=$NEXT_PUBLIC_CLARITY_PROJECT_ID \
    NEXT_PUBLIC_KEY_SEQUENCE=$NEXT_PUBLIC_KEY_SEQUENCE \
    NEXT_PUBLIC_CGR=$NEXT_PUBLIC_CGR \
    NEXT_PUBLIC_BR=$NEXT_PUBLIC_BR \
    NEXT_PUBLIC_RACE_SERVER=$NEXT_PUBLIC_RACE_SERVER

RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Sharp runtime dependencies for Next.js image optimization
RUN apk add --no-cache vips

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Writable dir for the Twingo Racer highscore store (data/highscores.json).
# Mount a volume here in Dokploy or scores reset on every redeploy.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

# Full-mode runtime: the custom server.js embeds the race WS relay
# (/race-relay) and needs real node_modules, not the standalone bundle.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/content ./content
COPY --from=builder --chown=nextjs:nodejs /app/data ./data
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/server/race-relay-core.cjs ./server/race-relay-core.cjs
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
