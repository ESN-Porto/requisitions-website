# Step 1: Install dependencies
FROM node:20-alpine AS deps
# libc6-compat might be needed by some native node modules
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package management files
COPY package.json package-lock.json* npm-shrinkwrap.json* yarn.lock* ./

# Install dependencies cleanly
RUN npm ci

# Step 2: Build the app
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* are inlined into the client bundle DURING the build, so they
# must exist here; at runtime it is too late. They arrive as build args (the
# compose file / CI passes them). The .env is in .dockerignore on purpose: it
# holds the service role key, which must never end up in any image layer.
# SUPABASE_SERVICE_ROLE_KEY is a runtime-only secret, injected via env_file.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SUPABASE_SCHEMA
ARG NEXT_PUBLIC_PROJECT_SLUG
ARG NEXT_PUBLIC_PROJECT_NAME
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_IT_MANAGER_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SUPABASE_SCHEMA=$NEXT_PUBLIC_SUPABASE_SCHEMA \
    NEXT_PUBLIC_PROJECT_SLUG=$NEXT_PUBLIC_PROJECT_SLUG \
    NEXT_PUBLIC_PROJECT_NAME=$NEXT_PUBLIC_PROJECT_NAME \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_IT_MANAGER_URL=$NEXT_PUBLIC_IT_MANAGER_URL

# Build the Next.js application
RUN npm run build

# Step 3: Production environment
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Item photos live in Supabase Storage (bucket item-images); the container has
# no writable uploads directory any more.

USER nextjs

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["npm", "run", "start"]
