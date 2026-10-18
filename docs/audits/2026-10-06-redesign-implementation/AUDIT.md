# Independent implementation audit

Date: 2026-10-06. Codex reviewed agy changes, before/after desktop evidence and local browser checks. This audit supersedes agent claims of complete implementation or complete verification. [Comparisons](INDEX.md) and [status](STATUS.md).

## Outcome

The core visual redesign is implemented and passes the local checks listed below. The entire original design specification is **partially complete**, not unconditionally accepted. Remaining work is listed explicitly. No deployment or real-course publication occurred; author receipt checks publish only in an ephemeral test database.

Four `gemini-3.8-flash-high` conversations ran concurrently with disjoint file ownership. Codex returned audit failures to the same conversations. Network interruption ended all correction runs; Codex resumed each exact conversation. Later agy returned account quota errors (reported reset approximately 2½ hours after failure). Several resumed runs returned wrapper ERROR despite success prose; they are recorded as failed executor runs. Artifact acceptance below is based on independent checks, not those prose claims.

## Implemented and checked

| Scope | Changes | Independent evidence |
|---|---|---|
| Learner | Persistent248px module/lesson sidebar, lesson-local task squares and green completed states, adjustable problem/code split, editor Run input mode and Submit, results, contextual report dialog, shorter settings copy, dashboard/outline refinements | Six browser workflows pass with throwing assertions: wrong samples; custom input42→84; passing Submit with green square, course2/7 and lesson2/4; controlled service failure and Retry preserving code; rapid task navigation/sidebar state; CodeMirror cursor/undo/redo. Reporting stays on task, has hidden IDs and human context; code attachment unchecked and actual report storage omits code without consent. See [browser log](learner-finalcheck6.log) and [final captures](learner/finalcheck/manifest.json). |
| Author | Persistent tree in editors, primary dirty Save vs secondary publication review, toolbar upload, compact inputs, grouped named exercise validation, learner shell in read-only preview, concise list/settings copy | Independent34-image recheck completed without capture errors; representative theory/preview/publication images inspected. Pure tree render and supplied authorized structure verified in source; hardcoded demo titles removed. [Capture log](author-recheck2.log). The subsequent [independent author audit](author/INDEPENDENT-AUDIT.md) passes eight browser workflow groups and saves 36 fresh screenshots after further corrections. |
| Admin | Compact detail summaries, focused user/course actions, scoped single-source stylesheet, honest telemetry, shorter tables/empty states | Independent58/58 browser checks across dark/light pass, including error preservation, focus/cancel, suspend/restore, author grants/revokes, support access, course availability, affected enrollment waiver review and persisted waiver. [Log](admin-recheck2.log) and [manifest](admin/recheck/manifest.json). |
| Public/account | Unified header/theme, workspace hero, compact catalog/course syllabus, concise Help/policy notices, themed denial pages, real verification error state | Independent8/8 browser checks pass; theme, filter chips, keyboard syllabus, sign-in validation, reset/verification errors, reporting, denial fallback. [Log](public-browser.log). Pending legal text stays pending. |

Final web build passed. All272web tests passed with0failures,0skipped. `git diff --check` passed. See [test log](redesign-accepted-tests.log) and [build log](redesign-accepted-build.log).

Screenshots:341valid PNG artifacts across before/after/recheck iterations, decoded and hashed in [verification inventory](verified-all-screenshots.json). One invalid agent scratch PNG is excluded. This count is iterations and theme variants, not341different routes. Desktop viewport1440×900; full-page captures retain desktop width1440. The generated terminal-verification summary is a test artifact, not an app screenshot.

## Audit corrections

- Replaced old Help-route report evidence with actual in-workspace click and submission; corrected code attachment default to explicit opt-in.
- Removed duplicate quiz primary action, repeated footer ordinal and permanent Mac shortcut.
- Added stale-route/editor ownership guards before asynchronous execution updates; synchronized lesson count from authoritative server progress rather than incrementing a stale selector.
- Removed unauthenticated author tree fetch, global image-load hydration workaround and course-only structure session cache. Routed actual authorized module data into editors and preview.
- Removed fabricated class-based public integration proposal; Help already had real routing.
- Preserved authored preview Markdown, corrected preview contrast and reading alignment. Exercise names now come from supplied course structure instead of hardcoded fixture names.
- Reopening admin waiver dialog now resets selection/review and keeps submit disabled until affected enrollment review succeeds.
- Improved harnesses to throw on failures. Infrastructure recovery uses a controlled job result through the application, not inserted DOM. Hidden test confidentiality checks the learner-facing service result, not the trusted worker's internal result. Fixed harness verdict assumptions and escaped injected test source.

## Remaining specification work

1. **Persistent mounted shells and full navigation performance:** navigation still replaces route markup in significant paths. Remembered sidebar state and async ownership checks improve continuity, but a fully retained shell, version-scoped cache, request cancellation architecture and measured navigation speed remain incomplete.
2. **Lesson resume policy:** scoped last-visited preference and a twelve-task mixed-state strip are now implemented and checked in the learner refinement pass. Locked states and wider fixture coverage remain partial.
3. **Author remaining specification:** editor save/error/retry, dirty-preview navigation, validation Edit-tests links/retry, controlled publication receipt, preview interactions and student revoke/reinstate now pass independent browser checks. Full mounted-shell retention, keyboard/accessibility coverage, invitation/connection lifecycles, large-data filtering and activity restoration remain partial. Python preview remains a read-only approximation with disabled execution controls. See the [current author audit](author/INDEPENDENT-AUDIT.md).
4. **Media/browser edge cases:** unavailable video fallback exists, but privacy/blocked-provider/slow-loading scenarios are not exhaustively verified. Actual policy text is unavailable and was not invented.
5. **Broader role completeness:** screenshots and tests cover seeded states. Exhaustive operational filtering, pagination, privacy lifecycle, large datasets, and accessibility/motion interactions across every planned page remain to be checked.

These items keep the master plan partial. Saved conversation IDs and exact pending handoffs allow resuming agy after quota recovery; do not treat elapsed time as approval or a successful executor run.

## Latest acceptance update

The outstanding author audit is complete. Confirmed preview, navigation and audit-harness defects were corrected and verified locally after the same-conversation agy network failure. All 294 web tests, the production build and whitespace check pass. See [author acceptance](author/INDEPENDENT-AUDIT.md) and [learner refinement review](learner/ICON-REVIEW.md) for fresh evidence. Earlier counts and logs above are historical. Full original-plan completion remains partial.
