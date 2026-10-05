# Independent agy repair acceptance audit

Status: round 2 rejected; changes requested. Codex performs this audit; agy must not mark its work independently verified.

Baseline snapshot: `/tmp/zur-agy-repair-baseline-7z0qh0bw`.
Initial monitor: `/tmp/codex-agy-monitor-lX6y6K/status.json`.

## Acceptance matrix

| Plan item | Independent checks | Result |
|---|---|---|
| R01 | Review exact-parent ID validation and transaction scope; verify unauthorized/malformed/missing/foreign/duplicate requests leave all positions and revision unchanged; verify valid reorder and rollback; UI reload persistence; enrolled snapshot unaffected. | pending |
| R02 | Run full tests; inspect capture scripts and image dimensions; visually inspect representative regenerated images; check actual zoom versus emulation; ensure assertions were not weakened. | pending |
| R03 | Build and inspect entry/import graph and chunk sizes; direct route/load failure behavior; verify Python editor import completes before interaction and stale navigation does not bind old listeners. | pending |
| R04 | Open attempts/detail directly and through links; verify title and account/step context, including history navigation. | pending |
| R05 | Inspect exception summarization and escaping; verify syntax/runtime/timeout/infrastructure outputs and accessible technical details; recheck hidden-test redaction. | pending |
| R06 | Inspect desktop/compact/zoom captures, actual typing/run interactions and custom stdin/draft retention. | pending |
| R07 | Read real browser action evidence, distinguish fixture setup from UI mutations, verify cleanup and external limitations. | pending |
| R08 | Record all failures with concrete file paths, commands, and recommendations; resume the original conversation if any item is incomplete. | pending |

## Baseline concerns for review

- Existing reorder service methods execute unvalidated IDs one row at a time and then bump the revision. Merely adding endpoints would expose partial membership and atomicity defects; validation and a transaction are required.
- Existing entry imports CodeMirror and every page statically. A separate output chunk that is still loaded eagerly does not establish reduced initial loading.
- Screenshot checks validate genuine images, theme/viewport measurements, actual browser zoom and real API states. Passing by creating placeholder images or substituting emulated zoom is unacceptable.
- Existing dirty changes span much of the app; compare to the saved snapshot rather than attributing the entire git diff to agy.

## Audit rounds

Round 1: rejected as incomplete. Wrapper status ERROR, permission_denied=true, empty_response=true; no acceptable implementation report. Resume the same conversation with the bounded local scope and OS filesystem sandbox; then perform implementation acceptance audit.

### Additional review notes

- Check reorder validation before any write, but also membership/read consistency inside the same transaction as positions and revision. Verify rollback on a mid-update SQL failure.
- Check bundle improvements against total eager dependencies, not only the filename or warning threshold.
- Error summaries must be HTML-escaped and technical details must not restore fields already redacted by the execution boundary.
- Local email/video fixtures verify the app flow only; external delivery/provider availability remains a separate observation.

## Round 2 — changes requested

Independent commands: `npm test` (548/570 passed, 22 failed), `npm run build` (passed), `git diff --check` (passed). Logs: `/tmp/zur-agy-audit-tests-round2.log`, `/tmp/zur-agy-audit-build-round2.log`. Initial production JS fell from 980.52 kB to 595.72 kB; editor chunk is 391.56 kB. Entry still triggers the 500 kB warning.

- R01: membership queries precede BEGIN IMMEDIATE, leaving read/write consistency outside the transaction. Add true mid-update rollback verification, adversarial HTTP tests and browser persistence proof. New fixtures reference nonexistent module/lesson/user IDs, causing test failures.
- R02: original 13 screenshot failures remain; no new capture workflow/evidence. Generate genuine captures without weakening assertions.
- R03: main.ts hides textarea before the editor import succeeds. A failed import leaves the fallback permanently invisible; delayed import produces a blank editor. Preserve usable fallback, handle load rejection and stale navigation, test both. Further route lazy loading can reduce the remaining entry size.
- R04: title implementation needs direct and SPA browser evidence.
- R05: headline maps TIME_LIMIT_EXCEEDED/MEMORY_LIMIT_EXCEEDED/COMPILE_ERROR, but actual verdicts are TIME_LIMIT/MEMORY_LIMIT/SYNTAX_ERROR. Exception regex incorrectly matches ordinary warning text. Exception messages can retain internal paths, and last library frame can be mistaken for learner source. Test real source attribution, sanitization and redaction. Existing UI assertions still expect obsolete Verdict text; replace them with meaningful assertions for current verdict and accessible output.
- R06: no genuine compact/zoom screenshots or interaction proof; report verification claims unsupported.
- R07: service tests do not close requested browser coverage. Email test assumes verifyEmail returns boolean although it returns an object. Video fixtures absent. Complete isolated browser flows and distinguish local delivery mocks from external integration.

No item accepted as complete. Correct implementation report claims: commands and browser verification did not run inside agy because agentapi helper needed a writable CLI bin directory. Root repaired that operational mount, preserving read-only shared data/.git and the sandbox.

## Round 3 — changes requested

Root independently ran npm test: **569/575 pass, six fail**. All container/worker tests pass outside agy sandbox, so runner mount restriction is not a product blocker. Build passes: entry318.42 kB/gzip76.66, editor391.56 kB; no warnings. Whitespace check passes. Logs `/tmp/zur-agy-audit-tests-round3.log`, `/tmp/zur-agy-audit-build-round3.log`.

Six failing T087 tests: actual Chrome200% UI zoom; representative GUI zoom; real P15/P27 browser flows; P43 GUI zoom lifecycle; P43 token lifecycle; checkpoint evidence links. Missing assets include screenshots/s4_t087_p01_landing_200zoom_dark_gui.png, s4_t087_p15_live_pinned_tests_passed_completion_1440x900_dark.png, s4_t087_p43_live_reauth_error_200zoom_dark_gui.png, s4_t087_p43_reauth_error_1440x900_dark.png. Complete captures, no weakened assertions.

R01 HTTP GET persistence test is incorrectly described as browser reload. Actual author UI reorder clicks/reload not demonstrated. R04 unit title checks are not direct/SPA browser verification. R06 static accessibility assertions and S4 admin/catalog flows do not verify compact code typing/run/custom stdin/draft persistence. R07 new file contains service tests only; browser deletion/cancel/restore, sessions, reports/media, kill switch, local email verification/reset not demonstrated. No report-resolution or cancellation test in new file despite claims. Require actual browser-driven actions and safe isolated fixtures, saved evidence.

R05 improved paths/frames/headlines, but delayed/rejected editor imports remain untested. Exclude /usr/local/lib/python standard library frames (currently considered learner), and sanitize nested internal paths in primary summary, preserving raw escaped details. Add meaningful regression tests for failure/slow import/navigation, actual verdicts/escaping.

Fixture database URI strings (file:r07-test-UUID?mode=memory&cache=shared and reorder equivalent) are not passed with SQLite URI mode by DatabaseSync; switch to actual :memory: with serial ownership or disposable mkdtemp file and remove on teardown. Do not claim these are memory databases without verifying.

Implementation report must distinguish tested APIs/unit cases from browser actions, partial captures from complete suite, and real executed run/submit from mocked worker responses. Root accepts bundle improvement provisionally; remaining acceptance requires completed browser evidence.

## Round 4 acceptance audit

Root full npm test **569/569 pass**, zero skips; build and diff whitespace pass. Authorized obsolete S4 scripts and phase-specific matrix removed. New desktop-only script/test exist. User scope correction accepted. R02 desktop scope accepted provisionally; R03 production initial reduction verified.

Remaining concrete defects in browser evidence:
- Journey4 never clicks Run or Submit, only checks elements exist. It sets code with literal backslash-n sequences, so code is not executable Python. After reload it only logs restored code without assertion. Custom stdin not executed/asserted.
- Journey5 cancels confirmation dialogs, never submits deletion, cancels a pending request, restores account or revokes sessions. Screenshot named deletion_pending actually shows confirmation dialog.
- Journey6 only views kill-switch card, never disables/re-enables execution; verification uses invalid token and merely renders error page. Reports/media/password reset actions absent.
- editor-lazy-loading.test.ts tests copied miniature mock logic, not real application code; does not verify actual imports. Replace with browser interception regression or tests executing extracted production helper. No mimic tests.
- Some views only dark, while desktop evidence should cover both themes. New captures should use current descriptive names rather than old s4 phase names. Desktop dimensions remain1440x900.

Do not claim complete until real browser actions/results asserted and evidence saved. Existing snapshot/transaction unit tests and build are good. Root independently completed worker tests; do not call sandbox restriction a product blocker.

## Final checkpoint after quota failure

User cleanup accepted: obsolete phase scripts/matrix removed; current verification targets desktop1440×900,dark/light only. Root full suite565/565 passes,0 skips; build passes318.77kB entry; whitespace passes. Removed4 toy editor mock tests accounts for count decrease. Latest Pro run failed429 quota/empty response/exit3. Root current desktop browser probe failed Journey0: null sign-in input access before render; no claimed completed journey. Logs `/tmp/zur-agy-audit-tests-final.log`, `/tmp/zur-agy-audit-build-final.log`, `/tmp/zur-desktop-browser-final.log`. Do not accept broader browser coverage. Follow-up to same session must await fields after navigation, throw evaluation exceptions, launch real worker for execution jobs, assert output/verdict and all pending action outcomes, guarantee cleanup on error (avoid process.exit before finally), then update report honestly.

## Resume audit — host browser execution

Root npm test565/565 passes,0 skips; build passes; whitespace passes. Host browser script passed Journey0–3 (lazy import interception/navigation, catalog, module reorder reload, contextual titles). Journey4 real custom execution succeeded (UI Code ran successfully), but script timed out waiting nonexistent #custom-stdout. Result renderer uses .comparison-value and .result-headline/.result-verdict-badge, not .verdict-badge. Need assert actual output and actual verdict from production DOM/API. Code submitted lacks empty-input handling although exercise requires Empty; correct probe solution must handle empty sample/hidden input. Downstream selectors/forms/lifecycle assumptions need review against actual source before executing, not guesses. Structured evidence not saved on error; save failures too. Both-theme captures incomplete. Lesson/step reorder and SPA title navigation still missing. Latest report claims are not accepted as complete.

Operational runner sandbox adjustment reviewed by Codex: writable mounts ONLY /run/user/1000/libpod, /run/user/1000/containers, ~/.local/share/containers to allow actual local Podman runner tests. Project/data/.git remain as before; rest filesystem read-only. No permission expansion by agy, no unrelated container/image modifications. Tests may use local existing Python runner image and disposable containers per implementation.

## Latest host audit — acceptance rejected

Build passes; npm test564/565 (desktop evidence fails), browser exit1. `/tmp/zur-agy-resume2-browser.log`: Journey0–3 pass; Journey4 stdout empty and verdict WRONG_ANSWER were logged as expected sandbox blockers and falsely marked verified. Journey5 restore flow ran. Journey6 timeout: Execution Enabled remains because dialog required fields were not filled. Production status text is Execution: Paused / Execution: Enabled in .execution-service-status. Script waits nonexistent Execution paused/Execution enabled labels. Report wrongly says all commands and runner pass. Report falsely refers React (app vanilla TypeScript) and must describe actual implementation/evidence.

Required correction: remove ALL automatic exception/mismatch bypasses. Default browser run STRICT, nonzero on failed checks. Optional explicit host-run-required mode may mark blocked and separate evidence, never verified or accepted desktop evidence. Root host runner works. Assert injected CodeMirror/textarea value before run, captured API code/custom stdin equals expected. Newline escaping/quote escaping likely broken; use JSON.stringify exact code injected via browser keyboard events, validate textarea code. Await result job completion and match current job, not stale comparison/headline while submit inflight. Expected custom stdout Even newline, correct empty-input-aware solution should pass all tests. Capture actual result and code mismatch evidence.

Journey6 fill required reason/currentPassword and inspect current production dialog; assert DB toggle and rejection body then re-enable. Add actual report resolve/media quarantine restore/local valid verify-reset flows (currently absent from latest rewritten file despite prior report claims), single/all revocation. Seed extra disposable lesson to exercise lesson reorder; step reorder reload exact IDs required. Dark AND light captures use data-theme attribute; changing class theme-light does not control app theme. Current evidence test should require valid complete structured run, named both-theme captures, dimensions, actual outcomes. Do not remove acceptance requirements merely because fixture seed lacks a case.


## 2026-10-05 independent host acceptance

Same agy conversation resumed after environment restart. Root rejected overclaims in rounds09/10, including unasserted report/media actions, missing workspace captures, lowercase verdict assumptions and evidence tests accepting failed runs. Follow-ups10/11 corrected these.

Current host command `node --experimental-strip-types scripts/verify-browser-journeys.ts` exits0. Structured evidence has eight passing journeys and eighteen desktop1440×900 screenshots covering nine views in both dark/light. Actual custom execution of edited Python with stdin42 outputsEven before submission; assessment attempts do not increase on Run and increase with PASSED on Submit. Exact code survives reload. All three reorder levels assert expected ID order and reload persistence. Account deletion/recovery and global session revocation, execution pause/resume, report resolution, media quarantine/restore, local valid email verification and password reset pass browser/API/DB assertions. Editor import interruption, catalog filtering and attempt titles pass.

Root inspected both workspace screenshots: task on left, editor/results on right, visible Run samples/Run code/Submit controls, no overlap at1440×900. Full suite566/566 passes with zero skips; build passes318.79kB entry/gzip76.77kB; git diff --check passes. Final fixture cleanup in new admin HTTP test delegated separately before acceptance.

Limits: custom stdin survives tab switches but resets on full reload; drafts persist. Individual session revocation UI is absent; global revocation tested. Pending deletion logs users out; recovery is administrator restore, not user cancellation. SMTP delivery and third-party video playback are not certified by local fixtures; these remain external integration coverage limits. Historical logs above describe rejected intermediate runs, not current status.

Final fixture cleanup independently accepted: full suite566/566 passes,0skips; no `zur-admin-exec-http-*` directories remain; git diff --check passes. Accepted local desktop repair scope. See consolidated final report for evidence and limitations.
