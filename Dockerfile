# Build stage: mise installs the Node and PocketBase versions pinned in
# mise.toml (the same ones used for local development) and builds the app.
FROM jdxcode/mise:2026.10.18-debian AS build
WORKDIR /app
COPY mise.toml ./
RUN mise trust && mise install
COPY package.json package-lock.json ./
RUN mise exec -- npm ci
COPY svelte.config.js tsconfig.json vite.config.ts ./
COPY web ./web
RUN mise exec -- npx vite build \
    && cp "$(mise which pocketbase)" /usr/local/bin/pocketbase

# Runtime stage: PocketBase serving the built app, hooks and migrations.
FROM alpine:3.24
RUN apk add --no-cache ca-certificates su-exec tzdata
COPY --from=build /usr/local/bin/pocketbase /usr/local/bin/pocketbase
COPY --from=build /app/pb_public /pb/pb_public
COPY pb_hooks /pb/pb_hooks
COPY pb_migrations /pb/pb_migrations
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

VOLUME /pb/pb_data
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD wget -qO /dev/null http://127.0.0.1:8090/api/health || exit 1
ENTRYPOINT ["entrypoint.sh"]
