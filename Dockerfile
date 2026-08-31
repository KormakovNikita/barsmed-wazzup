# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=1536"
# webpack uses less RAM than Turbopack on small VPS (1-2 GB)
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Russian Trusted CA (required for platform-api2.max.ru TLS)
RUN apk add --no-cache ca-certificates curl && \
    curl -fsSk -o /usr/local/share/ca-certificates/russian_trusted_root_ca.crt \
      "https://gu-st.ru/content/Other/doc/russian_trusted_root_ca.cer" && \
    curl -fsSk -o /usr/local/share/ca-certificates/russian_trusted_sub_ca.crt \
      "https://gu-st.ru/content/Other/doc/russian_trusted_sub_ca.cer" && \
    update-ca-certificates

ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

RUN mkdir -p .data && chown nextjs:nodejs .data

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
