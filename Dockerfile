FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS dependencies
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
ARG NEXT_PUBLIC_LEGACY_FRONTEND_URL
ARG AGENT_API_ORIGIN
ENV NEXT_PUBLIC_LEGACY_FRONTEND_URL=$NEXT_PUBLIC_LEGACY_FRONTEND_URL
ENV NEXT_PUBLIC_CHAT_TRANSPORT=projects-new
ENV AGENT_API_ORIGIN=$AGENT_API_ORIGIN
# These values only make the fail-closed Next config verifiable during image
# compilation. Deployments MUST inject real server-only values at runtime.
ENV SKILL_MARKET_DAILY_ORIGIN=http://127.0.0.1:3001
ENV SKILL_MARKET_GATEWAY_HMAC_SECRET=build-validation-only-secret-32-bytes
ENV SKILL_MARKET_PRINCIPAL_ID=build-validation-operator
ENV SKILL_MARKET_PRINCIPAL_ROLES=author
ENV SKILL_MARKET_PRINCIPAL_MANAGED_SCENARIOS=daily
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
