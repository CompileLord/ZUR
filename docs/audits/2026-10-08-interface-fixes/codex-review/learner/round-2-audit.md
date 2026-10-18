# Learner repair audit, round 2

Decision: rejected pending corrections. Same executor conversation `f8b02bd9-04ac-4ca4-89ff-6b71bf1081d0`, exact model `gemini-3.8-flash-high`. Wrapper returned SUCCESS, exit0, no permission denial; three tool errors occurred and are recorded, without treating wrapper prose as product acceptance.

## Retained passing repairs

Original independent18-check browser probe now passes18/18. The earlier five failures are fixed: open-report navigation cleanup, canceled-Back entry preservation, storage-denial profile guards, restore in-place failure context, and restore native keyboard containment. Source/test TS2353 regression is removed; targeted compilation retains the same ten baseline source errors with no new test errors. Focused regression58/58 and web build pass. Supplemental editor font/undo/redo/draft acknowledgment/quiz flow and account-scoped module expansion pass. Attempts-origin sidebar scope/reload passes too.

## Remaining verified failures

1. **L6 canceled Forward**: Learn→Profile→Explore→BackProfile→edit→nativeForward(cancel). URL remains `/courses` with the profile form mounted. The rollback always calls `history.forward()`. Reverse the actual traversal direction/distance while preserving existing entries, index and draft; repeated cancel, confirmed Back/Forward and discard must remain coherent. `learner-history-round-2-interactions.json`.
2. **L2 late restore acknowledgment**: Actual Python→Attempts→detail links, confirmed restore held pending in a local proxy, nativeBack returns to Attempts; release response redirects back to Python. Respect the current route/mounted owner on asynchronous completion/error. The already confirmed mutation was authorized; do not claim sent requests can be undone. `learner-restore-pending-round-2-interactions.json`.
3. **L7 generic502/504**: All four statuses500/502/503/504 tested with explicit empty-detail JSON faults.500/503 recover;502/504 become denial without Retry because classification special-cases only500/503. Actual HTTP status is preserved by CourseClient. Use status for denial versus service error; generic fallback wording does not make a5xx a404. `learner-service-status-round-2-interactions.json`.

These produce four failed supplemental checks across three findings. The original18 passing checks must remain passing.

## Rejected capture evidence

All52 refreshed PNGs decoded and visually reviewed before leaving the learner batch; see round-2-visual-review.md and round-2-image-verification.json. Long-code1100 and actual503 overview states are now present. Four report/profile error frames still insert feedback directly into DOM instead of sending a request under a controlled503. They are not actual failure-recovery evidence and their classes/copy differ from actual handlers. Replace with real controlled submissions and observed retained-input/consent feedback in both themes. No direct alteration of rendered errors, route globals or hardcoded pass observations.

Capture helper still needs bounded CDP rejection/timeouts, exact-query loader-aware navigation and actual observed theme rather than requested fallback. Remove the new production window.navigateTo global used solely for capture; follow actual app links. Keep synthetic L8 presentation/timing explicitly labeled and no official grading/measured latency claim. No historical grading or production runner certification.

## Validation limits

Executor reports full-suite667/669 with two missing historical screenshot artifacts; final Codex full-suite validation follows all accepted batches. Targeted TypeScript is not clean: ten preexisting source errors remain. Current58 focused tests and build passed independently. Existing source unit/rendering assertions are not native browser integration or proof of modal/history behavior.
