# ZUR deploy-readiness and CI inventory (2026-10-18)

Read-only audit, branch redesign/2026-10-18, Node v22.23.1 locally. [V] = verified by command/code read, [U] = unverified.

## Headline
**The server cannot start with NODE_ENV=production.** [V] Reproduced: `NODE_ENV=production DELETION_REGISTRY_PATH=<abs> DATABASE_URL=<file> node --experimental-strip-types packages/server/src/index.ts` throws at `getDatabase` (packages/server/src/db/database.ts:9-10, "This build supports SQLite file paths only...") called from `runMigrations` (migrate.ts:10, index.ts:9). The guard `|| NODE_ENV === 'production'` rejects SQLite outright. Also `.env.example` claims "Postgres for staging/prod" but no Postgres adapter exists (only node:sqlite).

## Findings by area
- **Start**: `npm run dev:server` = `node --experimental-strip-types packages/server/src/index.ts`; PORT default 3001 (.env.example says 3000, mismatch); runs migrations at boot; in production requires DELETION_REGISTRY_PATH (absolute, else throws) [V]. Listens on all interfaces, plain HTTP, console.log only.
- **Static web**: server does NOT serve packages/web/dist (no static/index.html handling in server.ts) [V grep]. Needs a separate static host / reverse proxy. Vite dev proxies /api to :3001 (ZUR_API_PROXY_TARGET). `npm run build` works (2.5s) [V]; only builds web.
- **Reverse proxy**: no trust-proxy/X-Forwarded-* handling [V]. Rate limits key on `req.socket.remoteAddress` (server.ts sign-up) so behind a proxy all users share one IP bucket. Session cookie: HttpOnly; SameSite=Lax; **no Secure flag** (server.ts:260).
- **Headers**: no HSTS, CSP, X-Frame-Options, Referrer-Policy; only X-Content-Type-Options on downloads [V grep]. Must be added at proxy or server.
- **CORS**: REST API sends `Access-Control-Allow-Origin: *` on every JSON response and preflight (server.ts:169,193) [V]. Cookie-auth with ACAO * is not credentialed so not directly exploitable, but is wider than needed. MCP uses Host allowlist (localhost, *.zur.internal, MCP_ALLOWED_HOSTS) and per-origin ACAO; production host must be added to MCP_ALLOWED_HOSTS or /mcp rejects.
- **Health**: `GET /healthz` does `SELECT 1` [V]; no separate readiness; no worker liveness check. Operational metrics service exists [not inspected further].
- **Worker**: `npm run dev:worker` (daemon.ts) polls the same SQLite file (DATABASE_URL), claims jobs, runs `podman run --rm --network=none --read-only --cap-drop=all --no-new-privileges --pids-limit=16 --memory --cpus=1 --pull=never` on pinned image `python@sha256:51dafde8...` (runner.ts:9,85-89) [V]. Needs podman on host, rootless user with image pre-pulled (`npm run runner:prepare`), and shared filesystem access to the DB (so same host or shared volume; SQLite across network FS is unsafe). Worker also hits `getDatabase`, so it has the same production-throw. Container-in-container needs nested rootless podman; simplest is worker as a host systemd service. SIGTERM handled gracefully.
- **DB**: SQLite, WAL, busy_timeout, FKs on. Migrations are forward-only SQL files, auto-run at server start [V]. No backup script/doc. WAL requires `.sqlite-wal/-shm` be backed up together or use `sqlite3 .backup`.
- **Dangerous paths**: `db:seed` DELETEs ~35 tables incl. users then inserts fixtures with known passwords (margaret@zur.internal/AdminPass123! etc., seed.ts:23-60) and a known MCP token `zur_sec_sample_author_mcp_token...` (seed.ts:439) [V]; no NODE_ENV guard. `db:demo-users` creates student@zur.local/StudentPass123!, author@zur.local/AuthorPass123! (no guard). Neither is run by index.ts [V], but one mistyped npm script wipes prod. Seed password hash uses sha256 (hashPassword in seed.ts) while the app uses scrypt; [U] whether verify accepts legacy sha256.
- **Uploads**: MediaService default `data/uploads`, staging `data/uploads/staged` (falls back to os.tmpdir in some case, server.ts:1446-1454) relative to CWD [V]. .env.example MEDIA_STORAGE_PATH is NOT read by any code [V grep]. Must be backed up with DB; CWD must be fixed.
- **Process mgmt**: no Dockerfile, compose, systemd, Procfile, .github, ci/ [V]. No .nvmrc, no `engines` in any package.json [V].
- **Node**: uses `node:sqlite` and `--experimental-strip-types`. Local v22.23.1 works (tests pass). node:sqlite landed unflagged in 22.13 (22.5 behind `--experimental-sqlite`); strip-types flagless in 22.18+/23.6+ [U, from Node release notes, not tested on other versions]. Recommend pin Node >=22.18 (24 LTS better); stderr emits ExperimentalWarning for SQLite (cosmetic). Running TS source in prod relies on an experimental flag; strip-types cannot handle enums/namespaces.
- **Build reproducibility**: package-lock.json present (3273 lines), workspaces; no per-package tsconfig; `npm run build` only builds web [V]. `npm audit` is unreliable: first run reported "2 high severity", rerun returned HTTP 400 "Invalid package tree, run npm install to rebuild your package-lock.json" [V] -> lockfile may be out of sync; run `npm ci` to check [U].
- **Typecheck** (root `npx tsc --noEmit -p .`, only tsconfig): **1270 errors**: scripts 764, docs 387 (evidence .ts under docs/), server 98, web 21, shared/worker 0 [V]. No per-package tsconfigs exist so per-package runs are not possible. Excluding scripts/docs, ~119 real errors. Not fixed.
- **Tests**: `npm test` -> 682 pass, 0 fail, 0 skipped, ~15s [V]. podman and python3 are present on this host; whether tests need them or mock them [U] (only packages/web/tests/desktop-visual-evidence.test.ts references docs/audits evidence paths; it passed here, and docs/audits is tracked [V], so may fail if evidence files are absent in CI [U]). Browser-journey scripts (scripts/verify-*.ts) need a Playwright/Chromium [U], not part of npm test.
- **Hygiene**: .gitignore covers node_modules, dist, .env, data/, sqlite, screenshots/ (59MB, untracked [V]). Not ignored: scratch/, .agents/, .claude/, skills-lock.json, many untracked scripts/*.ts. tasks.json is tracked and modified. Repo .git is 332MB; docs/ is 44MB of tracked PNG audit evidence (largest file 328KB). No committed .env [V]. Hardcoded credentials only in seed/demo scripts. data/ holds zur.sqlite, zur-demo.sqlite, uploads locally (ignored, 6.3MB). Many root planning .md files.
- **Env vars read** (grep process.env, runtime code only):

| Var | Default | Required in prod | Secret | Where |
|---|---|---|---|---|
| NODE_ENV | development | set to production | no | database.ts, index.ts, email service |
| PORT | 3001 | no | no | index.ts |
| DATABASE_URL | data/zur.sqlite (file path only) | yes (absolute) | no | index, worker, database, demo-users |
| DELETION_REGISTRY_PATH | none | **yes, absolute, separate backed-up volume** | no | index.ts, deletion-registry.ts |
| EMAIL_PROVIDER | postmark if prod/staging else mock | no | no | email-delivery-service |
| POSTMARK_SERVER_TOKEN | none | yes for real email | **yes** | same |
| EMAIL_FROM | none | yes for email | no | same |
| APP_BASE_URL | none | yes for email links | no | same (.env.example calls it APP_URL: mismatch) |
| MCP_ALLOWED_HOSTS | none | yes (prod hostname) | no | mcp/transport.ts |
| ZUR_API_PROXY_TARGET | http://localhost:3001 | dev only | no | web/vite.config.ts |
| (scripts only) HTTP(S)_PROXY, NO_PROXY, OUTPUT_DIR, AUDIT_MODE, AUDIT_SUPPLEMENTAL_ONLY | | no | no | scripts/ |

  Dead entries in .env.example (never read): APP_URL, SESSION_SECRET, MEDIA_STORAGE_PATH, MAX_IMAGE_UPLOAD_BYTES, EXECUTION_PYTHON_PATH, DEFAULT_*_TIMEOUT/MEMORY, MCP_ENDPOINT_URL [V grep]. SESSION_SECRET in the example is a real-looking hex string; sessions are DB tokens, so no signing secret is needed.

## Gaps (ranked)

| # | Sev | Gap | Smallest fix |
|---|---|---|---|
| 1 | BLOCKER | Server+worker throw under NODE_ENV=production (database.ts:9) | Remove `|| NODE_ENV==='production'` from the guard (keep URL-scheme check) or add a prod SQLite opt-in; add a test that boots with NODE_ENV=production |
| 2 | BLOCKER | Nothing serves web/dist | Serve dist from reverse proxy (Caddy/nginx) with SPA fallback and `/api`,`/mcp`,`/healthz` proxied; or add static handler in server.ts |
| 3 | BLOCKER | No Secure cookie, no HSTS/CSP/frame headers, no TLS | Terminate TLS at Caddy; set headers there; add `Secure` to cookie when behind HTTPS (env flag) |
| 4 | HIGH | Rate limiting uses socket IP; behind proxy all users share a bucket (incl. 10/hr sign-up cap) | Honor X-Forwarded-For only from a configured trusted proxy |
| 5 | HIGH | seed/demo-users unguarded, wipe users and plant known creds/token | Refuse when NODE_ENV=production or when DB has non-fixture users |
| 6 | HIGH | No backup/restore for sqlite+WAL, uploads, tombstones | Cron `sqlite3 .backup` + rsync data/uploads; separate volume for tombstones |
| 7 | HIGH | No process manager / Dockerfile / systemd / CI | Add files listed below |
| 8 | HIGH | Worker needs podman + pre-pulled digest + same-host DB; unrunnable inside plain container | Run worker as systemd unit on host; `runner:prepare` in provisioning |
| 9 | HIGH | CORS `*` on API | Restrict to APP_BASE_URL origin (or drop, same-origin via proxy) |
| 10 | HIGH | Typecheck 1270 errors (119 in packages), no per-package tsconfig | Add tsconfig.build.json excluding scripts/docs; fix server 98 / web 21; gate in CI |
| 11 | MED | Node version unpinned, experimental flags | `engines: >=22.18`, .nvmrc, document ExperimentalWarning |
| 12 | MED | .env.example inaccurate (dead vars, PORT/APP_URL mismatch, Postgres claim) | Rewrite to the real table above |
| 13 | MED | Uploads path CWD-relative, MEDIA_STORAGE_PATH ignored | Read env var or set WorkingDirectory in unit |
| 14 | MED | npm audit failing / lock tree invalid | `npm install` regen lock, then `npm ci && npm audit --omit=dev` |
| 15 | MED | Logs unstructured console.log, no request log | Ship stdout to journald; add access log line |
| 16 | MED | Readiness: /healthz doesn't check worker or registry file writable | Add /readyz checking tombstone path and worker heartbeat |
| 17 | LOW | scratch/, .agents/, .claude/, skills-lock.json untracked and not ignored; 44MB PNG evidence in git | Add to .gitignore; consider LFS/prune |
| 18 | LOW | Test dependency on docs/audits evidence files | Make the test skip when absent |

## CI pipeline (commands and needs)
1. Setup Node >=22.18 (actions/setup-node). `npm ci` (needs registry network).
2. Typecheck: `npx tsc --noEmit -p .` (currently fails; scope first).
3. Test: `npm test` (~15s, 682 tests; no services required as run here; podman/python3 not confirmed required [U]).
4. Build: `npm run build` (vite; no env).
5. Audit: `npm audit --omit=dev --audit-level=high` (network).
6. Optional nightly: `npm run runner:prepare` + podman for real-runner tests; Playwright journeys (scripts/verify-*.ts) need Chromium and a running server+worker [U].
7. Smoke: boot with NODE_ENV=production + temp DB + `curl /healthz` (would catch gap 1).

## Proposed topology (single VM)
Caddy (TLS, HSTS/CSP headers, serves web/dist, proxies /api /mcp /healthz to 127.0.0.1:3001) -> node server (systemd, user zur, WorkingDirectory=/srv/zur, DATABASE_URL=/srv/zur/data/zur.sqlite) + worker (systemd, rootless podman, same data dir) + volumes: /srv/zur/data (sqlite, uploads) and a separate /var/lib/zur-deletions (tombstones.jsonl, chmod 600, independently backed up). Nightly sqlite3 .backup + rsync off-box.

Files to add: `.github/workflows/ci.yml`, `.nvmrc`, `engines` in package.json, `deploy/Caddyfile`, `deploy/zur-server.service`, `deploy/zur-worker.service`, `deploy/backup.sh`, `deploy/env.production.example`, `deploy/RUNBOOK.md` (provision, runner:prepare, migrate, backup/restore, rollback), `Dockerfile` for server (optional; worker stays on host because of podman), `.dockerignore`, healthcheck = `curl -f localhost:3001/healthz`. Compose is optional and only if worker is moved to a privileged sidecar [U].
