# Operations and recovery readiness

**Status:** implementation guidance; staging and production procedures have not been exercised.

## Deployment adapter gap

`DATABASE_URL` currently accepts SQLite file paths only. A PostgreSQL URL now fails at startup instead of being treated as a SQLite filename. The approved PostgreSQL production decision has no application adapter or compatible migrations yet. Execution requests still run synchronously in the API process despite the persisted lease queue. Do not deploy this build as a separated API/worker service or count T005 as complete. Staging and production deployment manifests, secrets provisioning, rollback commands, and restore rehearsal depend on selecting and implementing those adapters.

## Monitoring currently implemented

- `GET /healthz` performs a database `SELECT 1` and returns only `{"status":"ok"}` when the API can reach its database. It does not prove email, object storage, runner, or backup health.
- Authenticated administrators can open `/api/admin/operations` or `/api/admin/operations/metrics`. The metrics route requires a valid admin session and reports five-minute request counts/p95 latency by coarse service family, queue age, expired execution leases, 24-hour infrastructure failure count, email delivery issues, process uptime/RSS, and threshold alerts.
- Every HTTP response includes a generated `X-Request-Id`. Unexpected server errors include the ID and emit a structured error record containing only a fixed event name and ID. Never attach request bodies, Python source, stdin/stdout, credentials, emails, or raw URLs to operational logs.
- Request samples are process-local, capped at 10,000, and reset on restart. Database-backed job, attempt, and email status survives API process restart. No worker heartbeat is configured; it is shown as unavailable rather than inferred from recent jobs.

Current alert thresholds are intentionally simple: any expired worker lease, queue age over 30 seconds, five or more infrastructure failures in 24 hours, any email-delivery issue, three autosave-family failures in five minutes, 20 auth-family failures in five minutes, or 20 authorization-denial/protected-resource-not-found responses in five minutes. Review thresholds against measured pilot baselines before paging. The in-memory request counters are not a paging system and do not persist across restart.

## Incident response

### Execution queue or runner degradation

1. Check `/admin` for queue age, stale leases, infrastructure failures, and current kill-switch state. Inspect paginated `/admin/execution` records.
2. If new work could worsen impact, use the audited `Disable new execution` action on `/admin/execution`. Confirm that it succeeded by reloading current state. Reading, browsing, and saved drafts should remain available.
3. Preserve the request ID, job ID, time window, and safe error category. Do not copy source code or hidden test values into an incident ticket.
4. Recover/retry only after the runner environment and capacity have been checked. Do not convert infrastructure failures into learner failures. Reopen execution with the audited resume action and verify a reference exercise end to end.

The present implementation executes jobs synchronously in the API process and does not have a separately managed worker heartbeat. A production worker shutdown command and queue-drain policy must be documented for the deployed architecture before pilot sign-off.

### Authentication, authorization, or autosave spike

1. Check the five-minute service-family metrics and correlate server error records with `X-Request-Id`.
2. Separate expected invalid credentials or safe 404 denials from elevated failures. Metrics do not retain user IDs or exact route identifiers, so investigate using approved identity/audit workflows.
3. For autosave failures, verify database availability and confirm a draft revision from a successful save before telling users work is synchronized. Preserve local recovery state.
4. If access control changed in a deployment, roll back to the last known-good artifact and verify the affected authorization tests before reopening traffic.

### Email delivery

Review pending, failed, and not-configured invitation records in the admin UI. Tell the owner whether delivery failed while the invitation itself remains valid; use the product's safe copy-link path only after confirming that state. Do not mark an email as sent based on provider acceptance alone unless the configured adapter reports successful delivery.

## Backup, restore, and deployment rollback

No backup provider, schedule, artifact-retention policy, deployment orchestrator, or staging restore target is configured in this repository. Do not claim the PRD recovery targets (RPO ≤24 hours, RTO ≤8 hours) are met.

Before a pilot, deployment owners must document and exercise:

1. Consistent backups for the authoritative database and media objects, encryption/access controls, retention, and an independent restore location.
2. A restore drill that measures actual data loss and elapsed recovery time, verifies foreign-key/data integrity, reapplies deletion-registry scrubs before service resumes, and confirms media references.
3. An immutable previous deployment artifact and exact rollback command for the selected hosting platform, including database migration compatibility and a smoke check.
4. A runner stop/drain procedure, limits on in-flight work, behavior for leases on restart, and a reference grading check before resuming submissions.
5. Named on-call ownership, alert delivery destination, severity mapping, and incident communications.

## Pilot load and reliability evidence

PRD §18 requires 100 concurrent learners and 20 execution requests/second for five minutes using the agreed reference exercises. Record the deployed API/database/runner hardware, operating system, concurrency profile, request distribution, warm-up, run duration, p50/p95/p99 page/API/save/queue/grading latency, accepted and rejected work, infrastructure failures, and acknowledged-write loss. The repository has no approved baseline device/network, production-like worker deployment, external monitoring sink, or agreed reference pilot environment. Local unit tests and a short smoke test are not evidence that these targets pass.
