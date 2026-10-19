#!/usr/bin/env bash
# Exit 0 if the node server answers /healthz (and /readyz when it exists). Usable as cron/monitor probe.
# Usage: healthcheck.sh [base-url]   (default http://127.0.0.1:3001)
set -euo pipefail
BASE="${1:-${ZUR_HEALTH_URL:-http://127.0.0.1:3001}}"
curl -fsS --max-time 5 "$BASE/healthz" >/dev/null || { echo "healthz FAILED" >&2; exit 1; }
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/readyz" || true)"
case "$code" in
  200|404) ;;  # 404 = server build without /readyz
  *) echo "readyz returned $code" >&2; exit 2 ;;
esac
echo ok
