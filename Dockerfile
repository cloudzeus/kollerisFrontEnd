# Kolleris storefront — production image.
#
# Written to replace a nixpacks build that failed, and the reason it failed is
# the reason this file pins a version on its first line. Nixpacks chose Node
# 22.11.0; the lock file was resolved by npm 11 (which ships with Node 24), and
# npm 10.9 computes a different dependency tree from the same package.json —
# `@swc/helpers` nested under next-intl's `@swc/core`. `npm ci` then refused,
# correctly, because the lock did not describe the tree it wanted to build.
#
# Verified rather than assumed: `npm ci` against this exact lock succeeds under
# npm 11 (848 packages) and fails under npm 10.9. So no dependency was changed
# to fix the build — the build was told which Node to use. Bump this line only
# together with a regenerated lock.
ARG NODE_VERSION=24.10.0

# Debian slim rather than Alpine, on purpose. Two native dependencies decide it:
# @node-rs/argon2 hashes every password, and sharp processes every image. Both
# publish musl builds, but a wrong native binary fails at runtime rather than at
# build, and a login that fails in production is not worth the 80 MB saved.
FROM node:${NODE_VERSION}-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1

# ── Dependencies ────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

# Only the manifests, so this layer is rebuilt when dependencies change and not
# when a component does. `npm ci` installs exactly the lock, never resolving
# afresh — which is what makes a build reproducible.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ── Build ───────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Baked into the JavaScript the browser downloads, so it has to be present now.
# The public site address, and nothing else: everything secret is read at
# runtime by the server, and a secret passed as a build argument is a secret
# recorded in the image's layer history.
ARG NEXT_PUBLIC_SITE_URL=https://web.kolleris.com
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}

# A placeholder, and deliberately an obviously fake one.
#
# prisma.config.ts reads DATABASE_URL through `env()`, which throws when it is
# unset — so `prisma generate` needs the variable to exist even though it never
# opens a connection. The real URL is supplied to the container at runtime. If a
# build ever fails trying to reach this host, that is the useful signal:
# something is querying the database during the build that should not be.
ENV DATABASE_URL=postgres://build:build@127.0.0.1:5432/placeholder

# The Prisma client is generated into src/, so it must exist before the compile
# rather than after it.
RUN npx prisma generate

ENV NODE_ENV=production
RUN npm run build

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Next writes the standalone server here at build time. It carries only the
# modules the server actually reaches, which is why this stage needs no package
# manager and no lock file.
COPY --from=builder /app/.next/standalone ./
# Neither of these is traced — one is emitted separately, the other was never
# imported by any module — so both are copied by hand.
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# `node` exists in the base image with uid 1000. Running as root would let a
# flaw in a dependency write to the application it is serving.
USER node

EXPOSE 3000

# The platform restarts a container that reports unhealthy. Asking for a real
# page rather than a socket check, because a Next server that has crashed
# inside its request handler still accepts connections.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
