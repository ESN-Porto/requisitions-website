# Step 1: Install dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* npm-shrinkwrap.json* yarn.lock* ./
RUN npm ci

# Step 2: Build the app
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The .env.production file must be present here so Next.js bakes in the NEXT_PUBLIC_ vars
RUN npm run build

# Step 3: Production environment
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Create the uploads directory and set permissions so the API route can write to it
RUN mkdir -p /app/public/uploads && chown nextjs:nodejs /app/public/uploads

USER nextjs
EXPOSE 3000
ENV PORT 3000

CMD ["npm", "run", "start"]