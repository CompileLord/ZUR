#!/usr/bin/env bash
# ZUR backup: consistent SQLite snapshot + uploads tarball + tombstone registry copy.
# Config via env (defaults match docs/DEPLOYMENT.md):
#   ZUR_APP_DIR=/srv/zur  ZUR_DATA_DIR=/srv/zur/data  ZUR_BACKUP_DIR=/var/backups/zur
#   DELETION_REGISTRY_PATH=/var/lib/zur-deletions/tombstones.jsonl
#   ZUR_BACKUP_RETENTION_DAYS=14
#   ZUR_BACKUP_REMOTE_CMD   optional hook run with the backup dir as $1, e.g.
#                           'rclone copy "$1" remote:zur-backups'  or  'rsync -a "$1"/ backup@host:/zur/'
set -euo pipefail

APP_DIR="${ZUR_APP_DIR:-/srv/zur}"
DATA_DIR="${ZUR_DATA_DIR:-$APP_DIR/data}"
BACKUP_ROOT="${ZUR_BACKUP_DIR:-/var/backups/zur}"
DB_FILE="${DATABASE_URL:-$DATA_DIR/zur.sqlite}"
REGISTRY="${DELETION_REGISTRY_PATH:-/var/lib/zur-deletions/tombstones.jsonl}"
RETENTION="${ZUR_BACKUP_RETENTION_DAYS:-14}"
NODE_BIN="${NODE_BIN:-node}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_ROOT/$STAMP"
mkdir -p "$OUT"
chmod 700 "$BACKUP_ROOT" "$OUT"

# 1. Database (sqlite3 .backup if the CLI exists, else VACUUM INTO via node:sqlite).
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_FILE" ".timeout 10000" ".backup '$OUT/zur.sqlite'"
else
  "$NODE_BIN" --experimental-strip-types --no-warnings "$HERE/sqlite-backup.mjs" "$DB_FILE" "$OUT/zur.sqlite"
fi
"$NODE_BIN" --no-warnings "$HERE/sqlite-backup.mjs" --check "$OUT/zur.sqlite"

# 2. Uploads (media). Missing dir is fine on a fresh install.
if [ -d "$DATA_DIR/uploads" ]; then
  tar -C "$DATA_DIR" -czf "$OUT/uploads.tar.gz" uploads
fi

# 3. Tombstone registry (append-only; restore must re-apply it, see RUNBOOK).
if [ -f "$REGISTRY" ]; then
  cp -p "$REGISTRY" "$OUT/tombstones.jsonl"
fi

( cd "$OUT" && sha256sum * > SHA256SUMS )
echo "backup complete: $OUT"

# 4. Retention.
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION" -exec rm -rf {} +

# 5. Off-box copy hook (failure is reported but local backup stays).
if [ -n "${ZUR_BACKUP_REMOTE_CMD:-}" ]; then
  bash -c "$ZUR_BACKUP_REMOTE_CMD" _ "$BACKUP_ROOT" || { echo "remote copy FAILED" >&2; exit 3; }
fi
