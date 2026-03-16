FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Build stage
FROM base AS builder
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built app
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy migration files
COPY --from=builder /app/lib/db/migrations ./lib/db/migrations
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules/.bin ./node_modules/.bin
COPY --from=builder /app/node_modules/drizzle-kit ./node_modules/drizzle-kit

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run DB migrations then start app
CMD ["sh", "-c", "node node_modules/.bin/drizzle-kit migrate || true && node server.js"]
