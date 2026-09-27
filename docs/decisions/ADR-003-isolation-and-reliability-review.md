# ADR-003: Python isolation and Phase A reliability review

- **Status:** Implementation reviewed locally; Phase A deployment gate pending
- **Date:** 2026-09-27
- **Scope:** PRD §§12–13, 17–18; S1 T019–T028

## Boundary now used

The API accepts Run/Submit into the SQLite lease queue and returns HTTP 202 with a stable job ID. `npm run dev:worker` is a separate process that claims jobs, heartbeats its lease, executes tests, and commits one terminal result. Student code runs per test in a rootless Podman container using the pinned Python 3.14.7 image `docker.io/library/python@sha256:51dafde81dbdb6ebde285137a295cf18a47ca95234fe388a343719cb97305b3d`. It has no network, a read-only root filesystem and source mount, a 16 MiB `/tmp`, stripped environment, an unprivileged UID, dropped capabilities, no new privileges, one process, 128–256 MiB memory, one CPU, and `prlimit` CPU, address-space, file-size, and process limits. The runner enforces a 5-second test wall timer and 60-second job deadline. It fails closed if Podman or the pinned image is unavailable. `npm run runner:prepare` pulls the pinned image before local use.

The worker's DB access is its authority to claim and complete jobs. Completion checks worker identity, live lease, and current enrollment/account/course access inside an immediate SQLite transaction. It inserts an attempt, updates progress, and stores the terminal job result in that transaction. Repeated or stale completions are ignored. Expired leases retry at most twice before a terminal infrastructure result; the original deadline persists across retries. API polling redacts hidden diagnostics.

## Local evidence

- `packages/worker/tests/runner.test.ts`: host `/etc/passwd` unavailable, environment secret absent, child process denied, outbound connection denied, output and wall limits, cleanup.
- `packages/server/tests/execution-boundary.test.ts`: pinned assessment, public/hidden grading, duplicate and stale completion, revocation before commit, idempotency, lease recovery.
- Manual API → separate daemon → poll on a file-backed SQLite fixture returned HTTP 202, then a persisted `PASSED` attempt.
- `npm test`: 484 tests passed on 2026-09-27.

## Gate still pending

The pinned container and SQLite worker have not been tested under the selected staging/production deployment, load target, backup/restore, or a reviewed seccomp policy. A deployment review must confirm filesystem, network, process, resource, crash, and cleanup behavior on that target before T028 and S1 can be marked done. S0 T005 remains in progress while reproducible staging/production deployment is unresolved.
