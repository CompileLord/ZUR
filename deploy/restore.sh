#!/usr/bin/env bash
# ZUR restore from a backup directory produced by backup.sh.
# Usage: restore.sh /var/backups/zur/20261019T020000Z [--yes]
# STOP zur-server and zur-worker FIRST. The current DB/uploads are moved aside, not deleted.
set -euo pipefail

SRC="${1:?usage: restore.sh <backup-dir> [--yes]}"
APP_DIR="${ZUR_APP_DIR:-/srv/zur}"
DATA_DIR="${ZUR_DATA_DIR:-$APP_DIR/data}"
DB_FILE="${DATABASE_URL:-$DATA_DIR/zur.sqlite}"
REGISTRY="${DELETION_REGISTRY_PATH:-/var/lib/zur-deletions/tombstones.jsonl}"
NODE_BIN="${NODE_BIN:-node}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ -f "$SRC/zur.sqlite" ] || { echo "no zur.sqlite in $SRC" >&2; exit 1; }
( cd "$SRC" && sha256sum -c SHA256SUMS )
"$NODE_BIN" --no-warnings "$HERE/sqlite-backup.mjs" --check "$SRC/zur.sqlite"

if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet zur-server zur-worker 2>/dev/null; then
  echo "zur-server/zur-worker are running; stop them first." >&2; exit 1
fi
if [ "${2:-}" != "--yes" ]; then
  read -r -p "Replace $DB_FILE with $SRC/zur.sqlite ? [y/N] " a; [ "$a" = y ] || exit 1
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DATA_DIR"
for f in "$DB_FILE" "$DB_FILE-wal" "$DB_FILE-shm"; do
  [ -e "$f" ] && mv "$f" "$f.pre-restore-$TS"
done
cp -p "$SRC/zur.sqlite" "$DB_FILE"

if [ -f "$SRC/uploads.tar.gz" ]; then
  [ -d "$DATA_DIR/uploads" ] && mv "$DATA_DIR/uploads" "$DATA_DIR/uploads.pre-restore-$TS"
  tar -C "$DATA_DIR" -xzf "$SRC/uploads.tar.gz"
fi

# The live tombstone registry is authoritative if it is newer than the backup: never roll it back.
if [ -f "$SRC/tombstones.jsonl" ] && [ ! -f "$REGISTRY" ]; then
  mkdir -p "$(dirname "$REGISTRY")"; cp -p "$SRC/tombstones.jsonl" "$REGISTRY"; chmod 600 "$REGISTRY"
fi

echo "restored. Start zur-server: it re-applies deletion tombstones at boot (reapplyDeletions)."
echo "Previous files kept as *.pre-restore-$TS"
