#!/bin/sh
set -eu

DATA_DIR=/pb/pb_data

# Start as root only to make the bind-mounted data folder writable, then
# re-run this script as an unprivileged user (PUID/PGID, default 1000).
# PUID=0 keeps running as root.
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
if [ "$(id -u)" = "0" ] && [ "$PUID" != "0" ]; then
  mkdir -p "$DATA_DIR"
  # Best effort: some mounts (NFS with root_squash, CIFS) don't allow chown.
  find "$DATA_DIR" \( ! -user "$PUID" -o ! -group "$PGID" \) -exec chown "$PUID:$PGID" {} + \
    || echo "entrypoint: couldn't change the owner of $DATA_DIR; continuing" >&2
  exec su-exec "$PUID:$PGID" "$0" "$@"
fi

# Keep the dashboard login (https://<host>/_/) in sync with the env vars.
if [ -n "${PB_ADMIN_EMAIL:-}" ] && [ -n "${PB_ADMIN_PASSWORD:-}" ]; then
  pocketbase superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" --dir "$DATA_DIR"
fi

exec pocketbase serve \
  --http 0.0.0.0:8090 \
  --dir "$DATA_DIR" \
  --publicDir /pb/pb_public \
  --hooksDir /pb/pb_hooks \
  --migrationsDir /pb/pb_migrations \
  --hooksWatch=false \
  --automigrate=false \
  "$@"
