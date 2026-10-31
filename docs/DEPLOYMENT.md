# ZUR deployment (single Linux VM)

Topology: **Caddy** (TLS, static `packages/web/dist`, reverse proxy to `127.0.0.1:3001`) -> **node server** (systemd) + **worker** (systemd, rootless podman) sharing one SQLite file.

Legend: [tested] = run in the authoring environment; [untested] = needs a real VM / network, review before relying on it.

## Server requirements (owned by the server-hardening task, assumed here)
Deploy only a build that has: no `NODE_ENV=production` DB throw in `database.ts`; `/readyz`; trust-proxy handling of `X-Forwarded-For` (rate limits otherwise share one bucket behind Caddy); `Secure` session cookie and security headers; CORS restricted. Until merged, production boot fails: `NODE_ENV=production npm run start:server` throws "This build supports SQLite file paths only" [tested, current state].

## Node version
`engines: >=22.18.0`, `.nvmrc` 22.23.1. Evidence: tests/build pass on Node 22.23.1 [tested]; no other Node was available offline, so lower versions are untested. From Node release notes (not re-verified): `node:sqlite` unflagged in 22.13, type stripping unflagged in 22.18. Code only uses `prepare/exec/close` of `node:sqlite`. Scripts pass `--experimental-strip-types` explicitly, which stays valid. Expect an `ExperimentalWarning` on stderr (silenced with `--no-warnings` in the units).

## 1. Prerequisites
```
# Node 22.18+ (nodesource/nvm), caddy 2.x, podman >= 4, git, curl
sudo useradd --system --create-home --home-dir /home/zur --shell /usr/sbin/nologin zur   [untested]
sudo mkdir -p /srv/zur /etc/zur /var/lib/zur-deletions /var/backups/zur /var/log/caddy
sudo chown zur:zur /srv/zur /var/lib/zur-deletions /var/backups/zur
sudo chmod 700 /var/lib/zur-deletions /var/backups/zur
```
DNS A/AAAA for your domain to the VM; ports 80/443 open.

## 2. Code, build, migrate
```
sudo -u zur git clone <repo> /srv/zur && cd /srv/zur && sudo -u zur git checkout <release-tag>
sudo -u zur npm ci            # [tested: npm run build / npm test]
sudo -u zur npm run build     # [tested] -> packages/web/dist
node deploy/csp-hash.mjs --check   # [tested] fails if index.html inline script hash != Caddyfile
sudo -u zur mkdir -p /srv/zur/data
```
Migrations run automatically at server start (forward-only). Never run `db:seed` or `db:demo-users` in production: they delete users / plant known passwords.

## 3. Environment
`sudo install -m 640 -o root -g zur deploy/env.production.example /etc/zur/zur.env`, then edit (domain, `POSTMARK_SERVER_TOKEN`, `EMAIL_FROM`, `APP_BASE_URL`, `MCP_ALLOWED_HOSTS`). All variables are documented in `.env.example`. `DELETION_REGISTRY_PATH` is mandatory in production and should live on a separately backed-up volume.

## 4. Services
```
sudo cp deploy/systemd/zur-*.service deploy/systemd/zur-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now zur-server
deploy/healthcheck.sh        # [tested against a dev-mode server]
```
### Worker and rootless podman [untested]
```
sudo loginctl enable-linger zur
echo "zur:100000:65536" | sudo tee -a /etc/subuid /etc/subgid   # if absent
sudo -u zur -H bash -c 'cd /srv/zur && XDG_RUNTIME_DIR=/run/user/$(id -u zur) npm run runner:prepare'
sudo systemctl enable --now zur-worker
```
The worker unit does not set `NoNewPrivileges`/`RestrictNamespaces` because rootless podman needs setuid `newuidmap` and user namespaces. It must run on the same host as the DB file (SQLite over network filesystems is unsafe).

## 5. TLS and web (Caddy)
```
sudo install -m 644 deploy/Caddyfile /etc/caddy/Caddyfile
printf 'ZUR_DOMAIN=learn.example.com\nZUR_ACME_EMAIL=ops@example.com\n' | sudo tee /etc/caddy/zur.env
# add EnvironmentFile=/etc/caddy/zur.env via: sudo systemctl edit caddy
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile   # [tested in caddy:2-alpine container]
sudo systemctl reload caddy
```
Caddyfile behavior tested in a caddy:2-alpine container [tested]: SPA fallback to index.html (`no-cache`), `/assets/*` immutable 1-year cache, missing asset is 404 (not HTML, not cached), `/media` and favicon 1 day, `/healthz` and `/api/*` proxied with `no-store`, gzip, HSTS/XFO/nosniff/Referrer-Policy/Permissions-Policy present. Automatic ACME issuance is [untested] (no internet here).

### CSP (derived from current code)
Shipped enforced (`Content-Security-Policy`). Verified on the production build with no violations across public, learner (theory, video, quiz, Python with CodeMirror), author and admin pages. Real dependencies found:
- No inline scripts or inline event handlers: the first-paint theme script is `/theme-init.js`. If an inline `<script>` is ever added to `index.html`, `node deploy/csp-hash.mjs --check` (run after `npm run build`) fails until its hash is in script-src.
- `style-src 'unsafe-inline'` is required: the shells inject `<style>` blocks (AdminShell, AuthorWorkspaceShell, AuthorPreviewPage), CodeMirror injects styles, and ~250 inline `style=` attributes/`el.style` writes exist (heaviest: AgentActivityPage.ts 133). Removing it needs code changes.
- Google Fonts: `fonts.googleapis.com` (css) + `fonts.gstatic.com` (font files); consider self-hosting to drop both and the privacy leak.
- `img-src data: blob:` (select chevron data-URI in components.css; admin media preview blob); `media-src 'self' blob:`.
- `frame-src` YouTube-nocookie, Vimeo, Loom (author video embeds).
- `connect-src 'self'` (only same-origin fetch; no websockets/EventSource/workers/eval found).
If a future change needs a looser policy, ship it as `Content-Security-Policy-Report-Only` first, watch for violations, then enforce.

## 6. Backups [tested locally with node-based snapshot; timer untested]
```
sudo systemctl enable --now zur-backup.timer     # nightly 02:30
sudo -u zur env $(grep -v '^#' /etc/zur/zur.env | xargs) /srv/zur/deploy/backup.sh
```
`backup.sh` snapshots SQLite (uses `sqlite3 .backup` if installed, else `VACUUM INTO` via node:sqlite), runs `integrity_check` + `foreign_key_check`, tars `data/uploads`, copies the tombstone file, writes SHA256SUMS, prunes after `ZUR_BACKUP_RETENTION_DAYS`, then runs optional `ZUR_BACKUP_REMOTE_CMD` (rsync/rclone) [hook untested]. Restore: see RUNBOOK.

## 7. Upgrade and rollback
Upgrade [untested as a whole; steps individually tested]:
1. `deploy/backup.sh` (always first). 2. `git fetch && git checkout <new-tag>`; `npm ci`; `npm run build`; `node deploy/csp-hash.mjs --check`. 3. `systemctl restart zur-server zur-worker` (migrations apply at boot). 4. Smoke checklist.
Rollback: migrations are forward-only, so rollback = checkout previous tag **and restore the pre-upgrade backup** (`deploy/restore.sh`) if the new release applied migrations. Code-only rollback is safe only if no migration ran.

## 8. Smoke checklist
- `curl -fsS https://DOMAIN/healthz` 200; `/readyz` 200 (once implemented).
- `curl -sI https://DOMAIN/` shows HSTS, CSP, `Cache-Control: no-cache`; `/assets/<hash>.js` immutable.
- Deep link (`/courses/x`) loads the SPA; sign-up/sign-in works, cookie has `Secure; HttpOnly`.
- A verification/reset email arrives (Postmark). `/mcp` reachable with an MCP token from the public hostname.
- Run a Python exercise end-to-end (worker + podman); `journalctl -u zur-worker` clean.
- `systemctl list-timers zur-backup.timer` scheduled; a manual backup passes integrity check.

## Docker / compose (optional)
`Dockerfile` (targets `server`, `web`) and `docker-compose.yml` run caddy + server; the worker stays on host systemd (needs podman + same SQLite file; point host worker `DATABASE_URL` at the compose `./data`). **Not built here**: this host has no network, so base images (`node:22.23.1-slim`) could not be pulled; only `caddy:2-alpine` was available (used for Caddyfile validation). Treat the Dockerfile as [untested]; the first CI build is its test. Note `docker-compose.yml` needs `deploy/env.production` (copy of the example with `/app/data` paths).

## Typecheck status (`npm run typecheck`, per-package tsconfigs extending `tsconfig.base.json`; scripts/, docs/, scratch/ excluded)
| Package | Errors | Notes |
|---|---|---|
| shared | 0 | |
| worker | 0 in worker files; 1 transitive | `worker/src/daemon.ts` imports `server/src`, so server's `execution-service.ts(271)` surfaces (layering smell: worker depends on server) |
| server | 98 (33 src, 65 tests) | see triage |
| web | 21 (7 src, 14 tests) | see triage |
(Root `tsc -p .` now covers packages only: 119 = 98 + 21; the original 1270 were mostly scripts/docs.) The server tsconfig adds the DOM lib solely because a server test imports a web module (115 -> 98 errors).

Server triage:
- **Likely real bugs/type holes (src)**: `server.ts` 499/508/518 call private `AdminService.requireAdmin` from outside (encapsulation break); `server.ts:576` unvalidated string passed as `'restore'|'quarantine'`; `server.ts:2178` `err` unknown; `draft-service.ts:23,183` (`toJSON` override incompatible, `.code` on a result lacking it); `execution-service.ts:271` verdict `string` vs `TerminalVerdict`; `identity-service.ts:595` `downloadUrl` not in return type; `teacher-roster-service.ts:672` `number|null` vs `number|undefined`; `course-structure-service.ts` 197/201/317/321/464/525 and `batch-authoring-tool.ts` (`currentCount` possibly undefined 954-1016, `StepType` vs `'create_step'` comparison at 601/943 = dead branch) – possible real logic bugs.
- **Library typing noise (src)**: `mcp/transport.ts` 119/185/196 and `agent-activity-tools.ts` 29/38 (MCP SDK schema types), `batch-authoring-tool.ts` TS2769 at 517/568/631, `admin-service.ts:270`, `auth-service.ts:168`, `product-analytics-service.ts:71` (sqlite param `undefined` overloads).
- **Tests (65)**: TS2339/TS18046 `unknown`/untyped JSON responses: noise.
Web triage:
- **Real**: `MyCoursesPage.ts:234` passes `isOpen` not in `DialogProps` (dialog may not open as intended); `PythonWorkspacePage.ts:198-201` verdict comparisons that can never be true (dead branches); `CoursePublishPage.ts:224`, `QuizEditorPage.ts:96`, `learning-navigation.ts:326` possibly-undefined values.
- **Tests (14)**: fixtures missing now-required fields (`draftRevision`, `verdict`, `blocking`), noise but fixtures drifted from types.

## Repo hygiene
`.gitignore` now ignores scratch/, .agents/, .claude/, skills-lock.json, evidence/, `.env.*` (except example), sqlite variants. Nothing was untracked. Recommendation only: `docs/**/*.png` audit evidence is ~44 MB tracked (repo .git 332 MB); move to Git LFS or an artifact bucket, and note that two tests (`audit-rules-s0`, `desktop-visual-evidence`) read evidence files (they fail in a fresh worktree where untracked `screenshots/` is absent).
