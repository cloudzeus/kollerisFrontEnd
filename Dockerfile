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
#
# `--include=dev` is NOT redundant, and removing it breaks the build.
#
# Το build χρειάζεται τα devDependencies: το `@tailwindcss/postcss` και το
# `tailwindcss` ζουν εκεί, και χωρίς αυτά το `next build` σκάει με
# «Cannot find module '@tailwindcss/postcss'» πάνω στο globals.css.
#
# Το deploy της 26ης Αυγ 2026 απέτυχε ακριβώς έτσι. Το log έλεγε «added 405
# packages» — και το lockfile έχει ΑΚΡΙΒΩΣ 405 πακέτα production, από 848
# συνολικά. Δηλαδή κάποιος παρέλειψε και τα 443 dev, χωρίς να το ζητήσει το
# Dockerfile: το `npm ci` εδώ δεν είχε καμία σχετική σημαία, δεν υπάρχει
# `.npmrc` στο repo, και το `NODE_ENV=production` μπαίνει αργότερα, στο στάδιο
# builder. Το κόψιμο ήρθε από το περιβάλλον που περνά η πλατφόρμα στο build
# (`NODE_ENV` ή `NPM_CONFIG_OMIT`), το οποίο δεν ελέγχουμε από εδώ.
#
# Το `--include=dev` υπερισχύει και του `--omit` και του NODE_ENV, οπότε το
# στάδιο γίνεται ανεξάρτητο από ό,τι κι αν έχει ρυθμιστεί στο Coolify. Η
# εναλλακτική — να αφαιρεθεί η μεταβλητή από τη πλατφόρμα — φτιάχνει το ίδιο
# build μία φορά και σπάει ξανά μόλις κάποιος την ξαναβάλει.
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

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

# Next writes its image-optimiser cache under .next/cache AT RUNTIME.
#
# Everything above was copied as root, so the directory tree belongs to uid 0
# while the server runs as uid 1000 — and `mkdir /app/.next/cache` fails with
# EACCES on the first optimised image. Next does not treat that as fatal: it
# logs an unhandledRejection per image and serves on, so production filled with
# thousands of identical errors and every image was re-optimised on every
# request, which is the part that costs CPU.
#
# Created and handed over here rather than at first use, because a directory
# that has to exist before the first request is not something to leave to the
# first request.
RUN mkdir -p /app/.next/cache && chown -R node:node /app/.next

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
