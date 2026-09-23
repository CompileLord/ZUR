# ADR-003: Python Execution Isolation and Reliability Review

- **Status**: Approved
- **Date**: 2026-09-24
- **Decision Owners**: Lead Implementation Engineer, Security Architect
- **Relevant Specifications**: PRD_V2.md §§ 11, 12, 13, 17, 18; design.md P15, P16, P25, P38; tasks.json T019–T028

---

## 1. Context and Review Objective

Phase A exit gate requires:
> "Isolated Run/Submit, hidden-output protection, idempotency, reconnect, malicious-code tests, and code recovery pass."

This document reviews and ratifies the execution isolation boundary, student hidden test protection, job durability, overload controls, and draft recovery mechanisms implemented in Module `S1-M02`.

---

## 2. Execution Boundary and Isolation Architecture

### 2.1 Subprocess & Sandbox Lifecycle
- **Isolation Boundary**: Python execution runs in worker processes physically separate from the web/API process.
- **Ephemeral Sandbox**: Every test run creates a temporary isolated directory using `fs.mkdtemp`.
- **Cleanup Guarantee**: Sandboxes and temporary script files are unconditionally cleaned up inside a `finally` block after every test execution.
- **Environment Stripping**: Child processes run with a strictly sanitized environment:
  - Secrets and ambient environment variables (`DATABASE_URL`, `SESSION_SECRET`, API keys) are completely removed.
  - `PYTHONUNBUFFERED="1"` and `PYTHONDONTWRITEBYTECODE="1"` are enforced.
  - Standard system PATH is constrained.

### 2.2 Strict Limits & Bounding
- **Source Code**: 64 KiB maximum (`validatePythonSource`).
- **Test Suite**: Maximum 50 tests per exercise (`validateTestCount`).
- **Input / Output**: Stdin and stdout capped at 64 KiB (`validateTestCaseInputOutput`).
- **Per-Test Wall Timeout**: 5 seconds per test with SIGKILL termination.
- **Per-Job Wall Timeout**: 60 seconds aggregate job ceiling.
- **Output Buffering**: Buffer caps at 64 KiB for stdout and stderr to prevent memory flooding.

### 2.3 Verdict & Error Classification
Verdicts are strictly classified into deterministic categories:
- `PASSED`: Output matches expected comparator rules.
- `WRONG_ANSWER`: Execution succeeded but output diverged.
- `SYNTAX_ERROR`: Code failed during Python parse/compilation.
- `RUNTIME_ERROR`: Unhandled exception or non-zero exit code.
- `TIME_LIMIT`: Execution exceeded wall time limit.
- `OUTPUT_LIMIT`: Stdout/stderr exceeded 64 KiB.
- `MEMORY_LIMIT`: Exceeded memory allocation thresholds.
- `INTERNAL_ERROR`: Infrastructure or execution worker failure.

---

## 3. Student Protection & Secret Leakage Prevention

### 3.1 Hidden Test Protection
- **Attack Vector**: Adversarial student code attempting to reflect or echo hidden test stdin to stdout or stderr to discover grading fixtures (Echo Attack).
- **Protection**: `redactFullExecutionResultForStudent` redacts:
  - All hidden test inputs and expected outputs.
  - All student actual stdout and stderr for hidden tests.
  - Test identifiers, sequence numbers, and per-test execution duration.
- **Verification**: Verified in `packages/server/tests/execution-boundary.test.ts` where hidden tests return generic `WRONG_ANSWER` indicators without revealing private test parameters.

### 3.2 Idempotent Submissions & Authoritative Progress
- **Idempotency Keys**: Submissions accept client-supplied UUID idempotency keys to ensure duplicate network transmissions return the existing job without re-queueing.
- **Authoritative Progress**: `assessment_attempts` records every submission immutably. Upon `PASSED`, `step_progress` is updated atomically. Subsequent failed submissions preserve completed progress (AC-12).

---

## 4. Quotas, Overload Controls, and Reliability

### 4.1 Admission & Rate Limits
- **Run Limit**: 10 runs per minute per user.
- **Submit Limit**: 5 submissions per minute per user.
- **Concurrency Limit**: Maximum 2 active (`QUEUED` or `RUNNING`) jobs per user.
- **Fair Queue**: First-come, first-served queue with bounded capacity.

### 4.2 Operator Emergency Controls
- **Kill Switch**: System setting `execution_paused` can be toggled by operators.
- **Degraded Presentation**: When paused, execution endpoints return 503 `ServiceUnavailableError` with retry guidance, while draft saving, viewing, and browsing remain fully operational.

### 4.3 Lease Expiry & Worker Crash Recovery
- Workers claim jobs with a 30-second lease timeout.
- Uncompleted jobs whose leases expire are automatically reclaimed by `recoverStuckJobs` (re-queued up to 3 retries or marked with `INTERNAL_ERROR` if exhausted).

---

## 5. Code Draft Persistence and Recovery

### 5.1 Multi-Layer Draft Architecture
- **Server Storage**: Server-side `code_drafts` table scoped by `(user_id, enrollment_id, step_id)` with optimistic locking (`revision`).
- **Collision Handling**: Stale updates return HTTP 409 `DraftConflictError` with latest server content and revision.
- **Local Cache**: Account-scoped `localStorage` keys (`zur_draft_${userId}_${enrollmentId}_${stepId}`).
- **Privacy Hygiene**: Sign-out clears all cached user drafts (`clearAllUserLocalDrafts`).

---

## 6. Verification and Phase A Exit Sign-off

All Phase A gate requirements have been verified via automated suites:
- `packages/shared/tests/comparator.test.ts` (UTF-8, limits, and normalized comparison).
- `packages/worker/tests/runner.test.ts` (Sandboxed runner, limits, process isolation, env stripping).
- `packages/server/tests/execution-boundary.test.ts` (Durable jobs, lease recovery, submission lifecycle, hidden redaction, attempt history & restore).
- `packages/server/tests/quotas-and-drafts.test.ts` (Quotas, kill switch, revision conflict handling).
- `packages/web/tests/workspace-pages.test.ts` (P15 workspace, P16 history, draft recovery, desktop guidance).

Phase A is confirmed complete and approved for progression to Phase B.
