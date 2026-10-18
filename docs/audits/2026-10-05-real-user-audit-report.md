# Fresh real-user audit and interface recommendations

Date: 2026-10-05. Three existing GPT-6 Luna low agents audited learner, author and public/account/admin workflows. Each used real Chrome with mouse/keyboard events, navigation and screenshots, separate temporary databases and browser profiles. Desktop1440×900, dark and light only. No direct desktop computer-use tool was available; Chrome CDP controlled the real browser. This was a fresh audit, not a rerun of prior automated acceptance scripts.

## Results and reports

| Role | Results | Complete report |
|---|---|---|
| Learner |61 recorded actions:60 pass,1 fail. Untested capabilities listed separately. |[Learner report](2026-10-05-learner-real-user-report.md)|
| Author | Broad CRUD/editor/preview/publish/student/invitation/token coverage;5confirmed defects. Results include limited and fixture-prepared passes. |[Author report](2026-10-05-author-real-user-report.md)|
| Public/account/admin |16 passing workflow groups,1 failed group,6explicitly untested groups. |[Features report](2026-10-05/features-real-user-report.md)|

These counts measure different units, so adding them into a single pass percentage would be misleading. Seven distinct confirmed product issues were found. All agents finished; root reviewed reports, evidence, selected screenshots and source paths, assisted hard diagnostics, and requested supplemental checks. Audit did not implement product fixes.

## Confirmed defects, in repair order

| Priority | Issue | Reproduction / user impact | Evidence / diagnosis |
|---|---|---|---|
|P0|Publication succeeds but screen reports failure|Create valid draft, save required metadata, review and confirm Publish. Backend releasesVersion 1; dialog says Publication failed and retains Draft state. Author cannot trust whether course is released and may retry.|[Network receipt and UI](evidence/2026-10-05-author-publish-diagnostic.json). `main.ts`1537 imports renderer locally, while separate handler at main.ts:1581 calls it without a binding. Root confirmed scope error.|
|P1|Theory Upload asset is inert|Open theory editor and click Upload asset; no chooser/modal/input opens. Apparent image-upload function is unavailable.|Author report and theory screenshots; control has no attached handler in current main.ts.|
|P1|Python reference check is inert|Enter reference solution and click Check reference solution; no progress or result appears.|Author action log/screenshots; visible control is not connected to a handler.|
|P1|Python hints are lost on save|Enter hints, Save, review publication; warning still reports no hints. Learners may receive no intended help.|Author report; Python save payload inmain.ts omits entered hint fields.|
|P1|Selected-course token scope has no picker|Choose Selected courses while eligible author course exists; nothing can be selected.|[Support diagnostic](evidence/2026-10-05-author-support-diagnostic.json);main.ts:562 requests nonexistent`/api/courses`, catches404 and empties list. Use an authorized owned-course listing, not an indiscriminate public catalog.|
|P1|Exercise report loses context|From Python exercise choose Report an issue, open form: course and step fields empty. Manually supplying course ID allows submission.|[Learner actions](../../screenshots/audit-2026-10-05/learner/actions-results.json). Link has stepId; Help route only initializes courseId. Pass course/version/step context and preserve after errors.|
|P1|Admin audit filters display false empty state|Apply action/reason filters; UI says no matches while read-onlyAPI returns 25 matches / 20 items.|[Feature evidence](../../screenshots/audit-2026-10-05/features/actions.json);main.ts:1633 compares entire route exactly to`/admin/audit`, excluding query strings. Filtered pagination shares this risk.|

P0 here means fix first because it undermines safe completion and trust; it is not a claim of a security incident. All seven issues remain open. Earlier accepted repair checks did not cover these exact interactions; a green automated suite did not prevent them.

## What works in the observed journeys

Learners can enroll, navigate theory/video/quiz steps, type in the editor, run samples and custom input before submission, see syntax/runtime/wall time results, save/reload drafts, reset starter code, submit both wrong and correct answers, inspect/restore attempts and complete all 7 required steps. A queued run completed after restarting the isolated worker without resubmitting. External video playback was not certified.

Authors can create/edit/archive/restore/delete courses; create/rename/delete/reorder modules/lessons/steps with reload persistence; duplicate steps; edit theory/video/quiz/Python fields and tests; preview; validate publication; manage student access; create/accept share links; inspect analytics; issue/revoke all-owned tokens; and use fixture-prepared recovery UI. Publication on the server works while receipt rendering fails.

Public/account/admin flows include catalog filters, validation, local valid/invalid token verification/reset, profile/theme/password changes, global sign-out, privacy request/confirmation, category CRUD, user and course moderation, report resolution, media quarantine/restore, execution pause/resume, support access, export fulfillment, aged fixture purge, waiver impact review and user pagination. All destructive operations were confined to disposable fixtures.

## Make the interface easier to understand

The agents evaluated the current interface as new users. These are evidence-informed design recommendations, not measured findings from a moderated usability study. User frustration supports prioritizing task clarity over adding explanatory paragraphs.

| Priority | Area | Concrete improvement |
|---|---|---|
|P0|Trustworthy state|Fix false publication feedback and lost hints first. After saving/publishing show accurate saved fields, version and next action. A polished layout cannot compensate for misleading success/failure states.|
|P1|Learner workspace|Keep one clear experiment action near the editor: Run code, with optional input immediately discoverable. Keep Submit solution distinct as graded action. Use short tooltips or contextual help for Samples/Run/Submit rather than a permanent paragraph. Label results with the run mode.|
|P1|Learner navigation|Show course-wide “4 of 7” consistently, selected module/lesson/step and next incomplete step. Keep outline easy to reopen and position stable across lesson types.|
|P1|Author onboarding|Guide through Basics → Structure → Build steps → Preview → Publish. Show one next required action; retain course/module/lesson/step breadcrumb when editing.|
|P1|Author validation|Connect each blocker to its field with an Edit link. Reference execution needs real per-test feedback; hints need persisted saved status. Put AI/recovery tools in secondary areas.|
|P1|Admin operations|Organize lists around task and status. Selecting an action should show target, current state, result, reason and password in one focused confirmation rather than competing repeated forms. Show resulting state and audit record.|
|P1|Error recovery|Prefill exercise reports and open the form directly. Distinguish no matches from failed loading. Show field-specific errors and actionable retries.|
|P2|Catalog|Show active filter chips, count and Clear all beside search/filters.|
|P2|Privacy|Separate export and deletion into request cards showing status, timing and next step. Distinguish canceling confirmation from recovering a committed deletion; do not promise unsupported cancellation.|
|P2|Admin limits and tokens|Give specific retry timing for reauthentication limits, preserve form inputs, and summarize token scopes/selected courses before issuing a one-time secret.|

Five first interface improvements: accurate publication receipt; clear Run/Submit grouping; consistent course-wide progress; a guided author workflow; one focused admin action confirmation. Functional repairs and visual changes should be verified through these same user journeys. Detailed role reports provide additional page-specific recommendations.

Suggested flows:

- Learner: Find course → Enroll → Resume first incomplete step → Read/watch/answer → Edit → Run → Inspect → Submit → Continue.
- Author: Basics → Module/lesson structure → Step editor → Save/preview → Reference tests → Resolve checklist → Publish receipt → Invite/manage learners.
- Admin: Filter relevant list → Inspect target/status → Choose action → Confirm once → Verify new state/audit record.

## Coverage limits and diagnostic notes

“All features” was treated as broad visible feature inventory, not proof of every edge case. Reports mark missing/unverified capabilities explicitly. Remaining limits include external SMTP/OAuth/MCP and video/audio; clipboard readback; exhaustive keyboard/screen reader testing; concurrent draft conflicts; leased job infrastructure failure retry; fresh second release/pinned version comparison; successful asset upload blocked by inert control; and some advanced admin filter/mutation combinations. Pricing and persisted language controls were absent from observed routes/UI. Existing responsive behavior was outside this desktop-only audit.

Busy CPU loop returned MEMORY_LIMIT while sleep(10) returned TIME_LIMIT. This deserves runner diagnostic review; memory exhaustion was not independently proven, so it is not added to the seven confirmed defects.

Initial apparent failures from offscreen clicks, unhandled native confirmation dialogs, case-sensitive waits, fixture passwords and reauthentication limits were investigated and excluded from product defects. Root proved headless dialogs work and helped agents correct browser harness handling. Browser/API/DB reads corroborated actual user actions; fixture-prepared recovery and tokens are labeled. No application fixes, external deployment or shared data mutations were performed in this audit.
