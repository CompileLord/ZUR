# Independent repair audit — bugs accepted

Final scope: F01–F07 and confirmed D01 only. User excluded Luna interface recommendations U01–U05; existing earlier partial edits were preserved.

Final host verification passed: **597 tests, zero failures/skips; production build; whitespace check; seven real Chrome workflows; 14 screenshots at1440×900 in dark/light**. Actual isolated Podman HTTP checks showed correct reference allpass, wrong reference fail, changed unsaved public test fail while hidden test passes. CPU loop returned TIME_LIMIT and delayed memory allocation MEMORY_LIMIT. [Machine-readable acceptance evidence](evidence/2026-10-05-codex-bugs-acceptance.json), [browser actions/screenshots](evidence/2026-10-05-repair-acceptance-actions.json), [agy self-check](2026-10-05-agy-repair-self-check.md).

The agy wrapper reported ERROR despite a nonempty report and saved changes. This is not recorded as an executor success. Codex accepted the artifacts after independent checks and same-session corrections. Agy's sandbox execution limitation was resolved by running the actual browser and Podman checks on the host. No deployment or shared database mutations were required. External integrations and the original audit's untested features are outside this acceptance claim.

The chronological findings below remain for traceability; the final checks above supersede their open status.

Agy conversation: `2aa23021-8b22-4b8e-95f4-da8b22d717ef`. Initial completion report rejected. Corrections sent to the same session. No item is accepted solely because agy marks it complete.

Verified on host after first self-check report: npm test 585/585 passed, build passed, git diff --check passed. These checks do not establish repaired browser workflows.

Outstanding findings sent to agy:

- Publication validation Edit links target nonexistent `/teach/:courseId/steps/:stepId`; actual editors require `/content/:type/:stepId`.
- Verify report context against actual API payload and pinned version, not renderer fixtures.
- Reference endpoint tests cover only rejection paths; need real pass/fail execution, unsaved tests, validation and bounded concurrency.
- Asset tests need isolated upload storage and browser insertion/save/reload/preview proof.
- Several interface recommendations and desktop screenshots are absent despite completion claims.
- Correct progress/self-check report to distinguish implemented, verified, partial and blocked work.

Fresh runner host diagnostic after the soft/hard CPU change:

| Program | Actual result |
|---|---|
| `while True: pass`, CPU 2s, wall 5s, memory128MiB | MEMORY_LIMIT, exit137, 3159ms — CPU classification still broken |
| Sleep2.5s then allocate512MiB under128MiB limit | MEMORY_LIMIT, exit1, MemoryError, 2782ms — expected memory failure |

Soft/hard CPU limit syntax alone did not fix CPU classification. Do not reinstate elapsed-time guessing; distinguish actual termination causes and verify through real execution.

## Browser harness diagnostic after reconnect

`verify-repair-acceptance.ts` wrote 7 groups: 2 PASS, 5 FAIL, 10 screenshots. It then remained alive for over30minutes because its local API server/CDP socket were not closed. Codex stopped only the identified child test process (PID91538) with SIGTERM to unblock agy. Fix owned service/socket cleanup and make failures cause a nonzero exit.

The recorded passes are limited: publication journey captures the existing review without clicking Publish, and admin journey accepts either table or empty state without corroborating matching rows/pagination. Failed groups contain wrong selectors/routes (`#upload-asset-modal` vs actual theory modal, incorrect Python tab selector, token route, workspace selector, deletion button). Correct harness before treating these as product failures. Upload insertion and hint save/reload/reference execution were not actually performed. Browser acceptance remains incomplete.

## Fresh host runner check after adding container init

Current runner `--init` with distinct soft/hard CPU limits now gives CPU-only loop TIME_LIMIT, exit152, 2236ms. Delayed allocation gives MEMORY_LIMIT, exit1/MemoryError, 2772ms. These two fresh host checks pass. The init helper and revised PID limit still require isolation review and regression suite verification; broad completion is not implied.

## Independent audit of latest bugs-only delivery

594 tests passed, production build and whitespace check passed. Fresh host runner diagnostic passed. Browser rerun passed F01 and F02, then failed F03 because the helper accepts a pre-existing status badge before execution finishes. It aborts before writing fresh JSON, leaving the previous seven-pass evidence stale.

Real isolated host HTTP diagnostic additionally found a product error: correct reference solution produces failed public and hidden tests because server uses `diff.matches`, but shared `compareOutput` returns `passed`. Both correct and wrong output are therefore treated as failure. Existing reference tests did not assert actual successful execution. Sent focused correction to the same agy conversation: fix comparator property, add meaningful success/failure/unsaved-test regressions, await fresh browser results and mark sandbox INTERNAL_ERROR blocked rather than passed. Full acceptance remains pending.
