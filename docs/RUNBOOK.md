# ZUR runbook

Commands marked [untested] need a real VM. Paths follow docs/DEPLOYMENT.md.

## Alerts to configure
| Signal | Check | Threshold |
|---|---|---|
| API down | `deploy/healthcheck.sh` every 1 min from cron/uptime monitor (external too: `https://DOMAIN/healthz`) | 2 consecutive failures |
| Server/worker crash loop | `systemctl is-failed zur-server zur-worker`; `journalctl -u zur-server -p err` | any |
| Backup stale | newest dir in `/var/backups/zur` older than 26h, or `zur-backup.service` failed | any |
| Disk | `/srv/zur/data`, `/var/backups/zur` > 80% | |
| Job queue stuck | admin page `/api/admin/execution/status`; worker log silent while jobs pending | > 5 min |
| TLS expiry | Caddy renews automatically; alert if cert < 14 days | |

## Common failures
- **Server exits at boot "SQLite file paths only"**: running a build without the production-guard fix. Deploy a hardened build.
- **"Production startup requires an independent DELETION_REGISTRY_PATH"**: set it in `/etc/zur/zur.env`, directory owned by `zur`, `chmod 700`.
- **`/mcp` rejected (host not allowed)**: add the public hostname to `MCP_ALLOWED_HOSTS`, restart server.
- **All users rate-limited / sign-up blocked**: proxy IP not trusted, every request looks like 127.0.0.1; verify the trust-proxy setting.
- **Blank page after deploy / chunk load errors**: users have a stale index.html cached by a middlebox, or `dist` was rebuilt while old tabs were open; hard refresh. Missing `/assets/*` correctly returns 404.
- **CSP violations after UI change**: inline script hash drifted; `node deploy/csp-hash.mjs`, update Caddyfile, reload caddy.
- **Python runs stay queued**: `systemctl status zur-worker`; `sudo -u zur podman info` (needs `loginctl enable-linger zur`, subuid/subgid, image pulled via `npm run runner:prepare`) [untested].
- **"database is locked"**: a stray process holding the DB; only server and worker may open it. Do not run backups with copy tools (`cp` of a WAL DB); use `deploy/backup.sh`.
- **Caddy cannot get a certificate**: DNS not pointing at the VM, or 80/443 blocked.

## Restore drill (do quarterly; steps 1-5 were exercised against a scratch DB [tested], systemd parts [untested])
1. `sudo systemctl stop zur-worker zur-server`
2. Pick a backup: `ls /var/backups/zur` (or fetch from the off-box copy).
3. `sudo -u zur env $(grep -v '^#' /etc/zur/zur.env | xargs) /srv/zur/deploy/restore.sh /var/backups/zur/<STAMP>`. It verifies SHA256SUMS and `integrity_check`, moves existing files to `*.pre-restore-<ts>`, and restores DB + uploads.
4. Keep the **live** tombstone registry (`DELETION_REGISTRY_PATH`); it is only restored from backup if absent. The server re-applies tombstones at boot so users deleted after the backup stay deleted (privacy requirement).
5. `sudo systemctl start zur-server zur-worker`; run `deploy/healthcheck.sh` and the smoke checklist.
6. Record time-to-restore; delete `*.pre-restore-*` once satisfied.

## Rollback of a bad release
See DEPLOYMENT.md section 7: checkout previous tag; if migrations ran, restore the pre-upgrade backup (taken in upgrade step 1).

## Dangerous commands (never in production)
`npm run db:seed` (wipes ~35 tables, plants known passwords and an MCP token), `npm run db:demo-users`.
