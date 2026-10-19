# syntax=docker/dockerfile:1
# Targets: `server` (node API) and `web` (Caddy serving packages/web/dist + proxying to server).
# The execution worker is NOT containerised: it needs rootless podman (see docs/DEPLOYMENT.md).
ARG NODE_VERSION=22.23.1

FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/worker/package.json packages/worker/
COPY packages/web/package.json packages/web/
RUN npm ci

FROM deps AS build
COPY tsconfig.base.json tsconfig.json ./
COPY packages ./packages
RUN npm run build

FROM node:${NODE_VERSION}-slim AS server
ENV NODE_ENV=production PORT=3001 DATABASE_URL=/app/data/zur.sqlite DELETION_REGISTRY_PATH=/var/lib/zur-deletions/tombstones.jsonl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
COPY packages/worker ./packages/worker
RUN mkdir -p /app/data /var/lib/zur-deletions && chown -R node:node /app/data /var/lib/zur-deletions
USER node
VOLUME ["/app/data", "/var/lib/zur-deletions"]
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--experimental-strip-types", "--no-warnings", "packages/server/src/index.ts"]

FROM caddy:2-alpine AS web
COPY --from=build /app/packages/web/dist /srv/zur/packages/web/dist
COPY deploy/Caddyfile /etc/caddy/Caddyfile
