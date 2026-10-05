# Desktop repair and independent acceptance report

Date: 2026-10-05. Implementation delegated only through delegate-to-agy; Codex planned, rejected incomplete results, sent corrections to the same conversation, and independently verified the final artifacts. Conversation: `2aa23021-8b22-4b8e-95f4-da8b22d717ef`. Progress was checked at17minute intervals.

## Result

The accepted local desktop repair scope passes. The workspace presents the exercise beside the editor and results, with visible Run samples, Run code, and Submit solution controls. Edited code executes with custom input before submission. Running does not create an assessment attempt; submitting creates a PASSED attempt. Exact code drafts survive reload. Root visually inspected the dark and light workspace captures at1440×900.

## Repairs and checks

| Area | Implemented and verified |
|---|---|
| Course structure | Module, lesson and step reorder controls/routes; authenticated exact membership validation; atomic transactions/revisions, rollback and published snapshot invariance tests; expected browser ordering persists after reload. Existing course/lesson CRUD coverage retained. |
| Desktop evidence | Obsolete S4 phase scripts and visual matrix removed per user instruction. Current probe produces18screenshots for9views in dark/light at1440×900. Structured evidence requires all8journeys to pass and records run timestamps, theme and viewport. Evidence test rejects failed/incomplete runs. |
| Loading and bundle | Editor/heavy routes load lazily. Browser import interception checks textarea fallback and interrupted navigation. Initial JS reduced from980.52kB to318.79kB (gzip76.77kB); editor chunk391.56kB. |
| Attempts | Contextual submission-history and attempt-detail titles; direct history and SPA detail navigation tested. |
| Errors | Concise exception/verdict presentation, learner source attribution and internal path sanitization; escaped technical details and hidden result redaction retained. Automated coverage includes learner errors and real execution contracts. |
| Workspace | Exact edited code asserted; custom input42 producesEven before submission; attempt counts and PASSED submission asserted; exact draft reload and theme persistence tested. Run/Submit controls fit desktop viewport in both themes. |
| Accounts | Deletion request revokes token, denies sign-in and marks pending deletion. Admin restore returns account active. Global sign-out removes sessions and revoked tokens receive401. Local valid verification/reset tokens work, consumed tokens fail, new password works and old password fails. |
| Administration | Fixed requireAdmin invocation in execution status/pause/resume routes. Browser pause/resume and disabled execution exercised. Report resolution and same-media quarantine/restore assert both DB and rendered state. HTTP regression checks auth, permissions, password validation and state changes. |
| Password reset | Corrected reset-password route matching with query tokens. Browser valid-token reset/reuse rejection verified. |
| Test isolation | New reorder/lifecycle/admin tests use disposable SQLite files. Admin test awaits server close, closes DB and removes temp directory. Final suite leaves no admin fixture directories. Shared app data preserved. |

## Independent validation

- `node --experimental-strip-types scripts/verify-browser-journeys.ts`: exit0,8/8journeys pass. Current evidence: `screenshots/evidence.json`.
- `npm test`:566/566pass,0fail,0skip after final fixture cleanup.
- `npm run build`: passes; initial JS318.79kB, gzip76.77kB.
- `git diff --check`: passes.
- Root inspected `screenshots/desktop_workspace_dark.png` and `screenshots/desktop_workspace_light.png`: clear task/editor/results layout and visible actions.

Host logs for this session: `/tmp/zur-host-browser3.log`, `/tmp/zur-final-tests-clean.log`, `/tmp/zur-host-build2.log`. Temporary logs may disappear after environment restart; repository evidence and reports persist. Wrapper terminal states reported ERROR despite returning edits; those states were treated as failures requiring independent artifact verification rather than trusted completion.

## Limits

Custom stdin survives tab changes but resets on full reload; code drafts persist. Individual device revocation is absent from the current product; global revocation is tested. Committing deletion logs the user out; recovery is administrator restore, not user cancellation of the committed request. Screenshot named deletion_pending shows the confirmation dialog, not a signed-in pending-deletion screen.

Local verification/reset fixtures prove token handling and browser forms, not external SMTP delivery. Third-party video playback/provider availability remains unverified. The browser probe covers the listed journeys, not every possible combination of every app feature. Initial broader audit reports retain their applicable integration coverage limits. No external publishing or deployment performed.
