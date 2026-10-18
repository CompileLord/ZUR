# Backend performance and reliability audit (2026-10-18)

Method: static read of packages/server and packages/worker; server run on a temp copy of data/zur-demo.sqlite (port 39871, data/zur.sqlite untouched); EXPLAIN QUERY PLAN on 11 hot queries. No load test at scale (demo DB has 1 course), so scaling claims are marked [unverified].

## Ranked findings

1. HIGH - Malformed client input returns 500, not 4xx. [verified]
   - `POST /api/auth/sign-in` with body `{bad` returns 500 INFRASTRUCTURE_ERROR; `{"email":1,"password":2}` also returns 500.
   - Cause: server.ts:143-161 parseJsonBody rejects with plain `Error` ('Invalid JSON payload', 'Payload too large'); the catch near server.ts:2177 treats it as unhandled and logs a stack. No type validation on sign-in fields.
   - Impact: bots can flood error logs/alerts; clients cannot tell bad input from outage.
   - Fix: throw ValidationError (400) / 413 error from parseJsonBody; check `typeof === 'string'` in sign-in.

2. HIGH - No graceful shutdown in the API server. [verified by grep]
   - packages/server/src/index.ts has no SIGTERM/SIGINT handler, no server.close(), no closeDatabase(). Only the worker handles signals (worker/src/daemon.ts:11-12).
   - Impact: each deploy resets in-flight requests. WAL recovers the DB.
   - Fix: on signal, server.close(), then closeDatabase(), with a forced-exit timer.
   - Worker: SIGTERM sets a flag and the in-flight job finishes. If the process is hard-killed, the podman container is only cleaned up by the lease recovery path (30 s lease), which is bounded.

3. HIGH - No HTTP timeouts, oversized body cap. [verified by grep and code]
   - No headersTimeout/requestTimeout/keepAliveTimeout set anywhere. Node defaults apply.
   - parseJsonBody caps at 20 MB, but after rejecting it neither calls `req.destroy()` nor stops appending, so the whole body is still buffered. 20 MB is large for JSON routes.
   - Fix: 1 MB default cap (larger only for upload routes), destroy on overflow, `server.requestTimeout = 30000`.

4. MEDIUM - Health/readiness. [verified]
   - `/healthz` (server.ts:210) does SELECT 1 and returns 200.
   - `/readyz` returns 404.
   - No worker liveness signal and no queue-depth or oldest-queued-age metric for alerting.
   - Fix: add /readyz (migrations applied, DB ok), expose queue age, add a worker heartbeat.

5. MEDIUM - Sign-in limiter memory and proxy IP. [from code]
   - identity-service.ts:26 `rateLimitMap` entries are removed only on successful sign-in or when the same key is re-checked after expiry. There is no sweeper, so rotating emails grows it without bound. Not measured. It also resets on restart.
   - The DB limiter (auth_request_limits) has no visible purge [unverified: grep for a DELETE].
   - All limits key on `req.socket.remoteAddress` (server.ts sign-up/sign-in). Behind a reverse proxy every user shares one IP, so 60 sign-ins per 15 min and 10 sign-ups per hour apply to the whole site. This will bite on first deploy.
   - Fix: trusted X-Forwarded-For behind an env flag; unref'd interval to prune both limiters.

6. MEDIUM - Snapshot JSON parsed per row. [from code; demo timing 2-5 ms for catalog with 1 course]
   - Public catalog (course-service.ts ~line 823) JSON.parses `snapshot_data` for each of up to 100 rows per request, uncached, only to compute lessonCount/stepCount.
   - Fix: cache by versionId (versions are immutable) or store counts on course_versions at publish (course-publication-service.ts:288).
   - admin-service.ts listMedia (~line 327): per media row it loads all course_versions snapshots of the course and does string `includes`, plus a `LIKE '%id%'` scan over step_contents. This is an N+1 with full scans and is admin-only.
   - deleteMedia, previewWaiver and admin course detail (line 192) parse every version snapshot.
   - Single-snapshot parses in learning-progress, quiz, execution and teacher-roster are acceptable but cacheable.

7. MEDIUM - Pagination inconsistent.
   - Catalog clamps limit 1..100 and offset >= 0. `limit=abc` falls back to 20 and `offset=-5` to 0 [verified].
   - Other lists re-implement paging (admin `this.page`). pagination.ts exists but is not used everywhere.
   - Per-user data export (admin-service.ts:341-355) is unbounded by design and synchronous.

8. MEDIUM - Execution queue and worker. [from code]
   - Good: 30 s leases with 10 s heartbeat, recoverStuckJobs with retry_count and deadline, hourly purge, mkdtemp dir removed in `finally` (runner.ts:250), podman `--rm --network=none --read-only`, kill via cidfile, fair-share ordering.
   - Gap: recoverStuckJobs runs only inside claimNextJob (execution-service.ts:284). With no worker running, queued/stuck jobs never expire and learners poll forever. Fix: also call it from the API process on an interval or on status reads.
   - daemon.ts:24 `catch {}` swallows the error with no log. The heartbeat `setInterval` callback can throw on SQLITE_BUSY and, uncaught, would crash the daemon [unverified].
   - Concurrency is 1 job per daemon. Scale by running more daemons; claim uses BEGIN IMMEDIATE, so this is safe.
   - The fair-share claim query uses a correlated `MAX(updated_at)` subquery over completed jobs. The plan uses idx_execution_admission(status), so it scans all completed jobs for each candidate. Retention purge mitigates [plan verified, speed unmeasured].

9. LOW - SQLite pragmas. [verified]
   - database.ts:28-32 sets busy_timeout 5000, foreign_keys ON, WAL.
   - synchronous is 2 (FULL). `NORMAL` is safe under WAL and faster.
   - node:sqlite is synchronous, so every query blocks the event loop. Server and worker share the file, and write contention beyond 5 s surfaces as 500s.
   - Whether password hashing is async scrypt was not checked [unverified].

10. LOW - Logging and errors.
    - Unhandled errors log JSON with requestId and stack, and the response does not leak the stack [verified].
    - No access log and no process-level unhandledRejection/uncaughtException handler in the server [grep].
    - `err.stack` on a non-Error throw would itself throw inside the catch [unverified edge].
    - Migration numbering jumps 008 to 018. Check it is intentional.

11. LOW - Indexes. [verified]
    - EXPLAIN on enrollments by user/course, step_progress, sessions, courses by owner, media by course, course_versions and the queue all use indexes.
    - Only `assessment_attempts ... ORDER BY created_at` adds a temp B-tree (small per enrollment).
    - Catalog `LOWER(..) LIKE '%x%'` search and the media reference scans cannot use indexes. This is fine for a small catalog; consider FTS5 later.

12. LOW - Integrity.
    - Transactions are used in admin writes, the limiter, claim and recovery.
    - Media delete commits the DB delete and then unlinks the file, so a failed unlink leaves an orphan file.
    - Orphan-row sweep was not performed [unverified].

## Smallest-fix order for first deploy
1. Map parse and validation errors to 400/413 (finding 1).
2. SIGTERM handler, server timeouts, smaller body cap (2, 3).
3. Trusted-proxy client IP, prune limiter state (5).
4. Run recoverStuckJobs from the API process (8).
5. /readyz plus worker heartbeat and queue-age metric (4).
6. Cache or precompute catalog counts (6).
