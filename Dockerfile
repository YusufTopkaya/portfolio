FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat vips-dev build-base
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild Sharp for Alpine Linux
RUN npm rebuild sharp

FROM base AS builder
RUN apk add --no-cache vips-dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Sharp runtime dependencies for Next.js image optimization
RUN apk add --no-cache vips

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
