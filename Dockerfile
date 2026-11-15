# syntax=docker/dockerfile:1

# One Dockerfile, two images, both built by the stack in docker-compose.yml and by
# .github/workflows/publish-images.yml:
#   --target app      the Next.js standalone server
#   --target migrate  applies migrations and the reference data, then exits
#
# Node runs Next.js. Bun installs dependencies and runs the bundled ops CLI in the migrate image.

ARG NODE_VERSION=24
ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION} AS bun

FROM node:${NODE_VERSION}-slim AS deps
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
# env.ts validates the environment whenever the server code is loaded, which `next build`
# does. These placeholders exist only for this command: no variable is NEXT_PUBLIC_, so none
# is inlined, and the real values are read when the container starts.
RUN ENVIRONMENT=production \
    POSTGRES_URL=postgresql://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-only-placeholder \
    VAPID_PUBLIC_KEY=build-only-placeholder \
    VAPID_PRIVATE_KEY=build-only-placeholder \
    bun run build

# The ops CLI and the deploy entrypoint, each bundled into one file with its dependencies.
# They sit at scripts/ops/ so that "../../drizzle" still finds the migrations.
FROM deps AS ops
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN bun build scripts/ops/index.ts scripts/ops/deploy.ts \
    --target=bun --external pg-native --outdir=/out/scripts/ops

FROM oven/bun:${BUN_VERSION}-alpine AS migrate
WORKDIR /app
COPY --from=ops /out/scripts ./scripts
COPY drizzle ./drizzle
# Keeps `bun run ops <command>` working in a console on this container. Only commands that
# need no development tools work here: migrate and studio need drizzle-kit, seeding the app.
RUN echo '{"name":"csk-hub-ops","private":true,"scripts":{"ops":"bun scripts/ops/index.js"}}' > package.json
USER bun
CMD ["bun", "scripts/ops/deploy.js"]

FROM node:${NODE_VERSION}-slim AS app
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/auth/ok').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]
