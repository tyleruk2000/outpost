# syntax=docker/dockerfile:1

# ── Build ────────────────────────────────────────────────────────────────────
# Runs on the build machine's own architecture: the output is JavaScript plus
# prebuilt SQLite binaries for every platform, so nothing here is cross-compiled.
FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY . .
# Map fonts and sprites are fetched at a pinned commit so the image works offline.
RUN node scripts/fetch-map-assets.mjs && node scripts/build-app.mjs --out /out/app

# Keep only the SQLite binaries this image can use.
FROM build AS trim
RUN find /out/app/server/node_modules/better-sqlite3/prebuilds -type f ! -name 'linux-*' -delete

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim
LABEL org.opencontainers.image.title="Outpost" \
      org.opencontainers.image.description="Knowledge beyond the network: a self-hosted, offline-first knowledge platform." \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/tyleruk2000/outpost"

ENV NODE_ENV=production \
    OUTPOST_HOST=0.0.0.0 \
    OUTPOST_PORT=8080 \
    OUTPOST_DATA_DIR=/data \
    OUTPOST_STORAGE_ROOTS=/storage \
    OUTPOST_KIWIX_LIBRARY_PATH=/kiwix/library.xml \
    OUTPOST_SUPERVISED=true

COPY --from=trim /out/app /app

# OUTPOST_SUPERVISED tells the server that something restarts it when it exits (the
# Compose restart policy), which is what lets a restore finish with one click.
# /data holds the database and attachments; /storage/internal the default library.
# Both are owned by the unprivileged "node" user (uid 1000) the server runs as.
RUN mkdir -p /data /storage/internal /kiwix && chown -R node:node /data /storage /kiwix
USER node
VOLUME ["/data", "/storage/internal", "/kiwix"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.OUTPOST_PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

ENTRYPOINT ["node", "/app/server/outpost.mjs"]
