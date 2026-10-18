# ZUR author repair re-audit

**Date:** 2026-10-06  
**Scope:** Recheck the repaired author flows, then exercise broader course creation, editing, publishing, enrollment, and management journeys. Interface redesign recommendations were out of scope.  
**Environment:** Fresh isolated SQLite databases, API, Vite, worker where needed, temporary upload directories, and dedicated Chrome profiles. Desktop 1440×900 in dark and light themes. Interactions used visible controls and CDP mouse/keyboard events; API reads corroborated visible outcomes. All courses, students, files, tokens, and invitations were disposable and local. No product source was edited by this audit.

## Result

The five main author repairs pass in real browser journeys: publication now shows a truthful receipt, theory images can be uploaded and previewed, reference validation uses current unsaved tests, Python hints persist, and the selected-course token picker can issue a token restricted to an owned private course. The broad author journey recorded 21 PASS, one FAIL, and one BLOCKED result.

Two remaining issues need attention:

- **Medium: publication history is missing from Course Settings.** A browser-published Version 1 and Version 2 both showed successful receipts. Ada remained pinned to Version 1 and new learner Alan was pinned to Version 2. Yet Settings → Publication & versions showed zero release rows and the empty-state message implied a private draft.
- **High: recovery restore fails when learner progress references course steps.** The browser attempt with a synthetic activity record is inconclusive and excluded from product results. Separately, root reproduced a faithful snapshot restore on a fresh seeded database with two step-progress rows and zero attempts; restore raised `FOREIGN KEY constraint failed` and rolled back. The service deletes the referenced step rows, which `step_progress` restricts.

## Evidence and counts

The focused repair acceptance run completed seven workflows with zero failures or blocks and captured 14 dark/light screenshots: [valid repair actions](evidence/2026-10-06-author-repair-reaudit-valid-actions.json). Its images are in [repair screenshots](../../screenshots/audit-2026-10-06/repairs/).

The broad author browser run completed 23 action groups: 21 PASS, one FAIL, and one BLOCKED, with 50 screenshots. See [broad action results](evidence/2026-10-06-author-full-reaudit3-actions.json) and [broad screenshots](../../screenshots/audit-2026-10-06/author-recheck3/). The blocked item is recovery UI setup, not a product pass/fail: the audit had not generated its activity record through a real authorized tool call.

The recovery service confirmation is recorded in [root recovery diagnostic](evidence/2026-10-06-root-recovery-diagnostic.json). It reports a fresh seeded DB, a normal service-created revision 1 snapshot, two `step_progress` rows, zero `assessment_attempts`, and a restore `FOREIGN KEY constraint failed`; title and revision remained unchanged after rollback.

A later attempt to extend the browser checker for wrong-reference input stayed on the sign-in page because the isolated Chrome session failed to load its initial navigation. Those observations are saved in [session failure details](evidence/2026-10-06-author-repair-reaudit-session-failure.json) and are excluded from application-failure counts. The successful browser runs remain separate and intact.

## Functional inventory

| Feature | Status | Verification |
|---|---|---|
| Course list search and status filters | PASS | Changed filters/search through visible controls and observed matching route/results. |
| Course create and settings edit/save | PASS | Created disposable draft; edited title, description, outcomes, tags, duration, and access policy; reloaded saved values. |
| Course archive, restore, delete and cancel | PASS | Archived/restored a separate draft; canceled delete once, then confirmed delete. |
| Module create, rename, reorder, persistence | PASS | Created two modules, reordered, reloaded, confirmed order, and renamed. |
| Lesson create, rename, reorder, persistence | PASS | Created lessons, reordered, reloaded, and renamed. |
| Step create, duplicate, delete, reorder | PASS | Created theory, video, quiz, and Python steps plus an extra theory step; reordered/reloaded, duplicated, canceled deletion, then deleted duplicate. |
| Video editor and transcript/caption settings | PASS, limited | Entered URL, transcript, and caption state and saved. External player playback/audio was not verified. |
| Theory formatting and image upload | PASS | Formatted Markdown; uploaded generated PNG through the visible dialog, inserted Markdown, saved, reloaded/previewed the authorized asset. Screenshots `05-theory-editor` and F02 repair screenshots. |
| Quiz options and single/multiple answer mode | PASS | Added options, selected answers, changed mode, saved explanation, and previewed. No quiz-specific progressive hint field was visible. |
| Python reference solution, public/hidden tests | PASS, limited | In the successful broad run, entered a known correct reference and four current tests (two public, two hidden); all four returned PASS. A separate focused run showed the correct reference pass and an unsaved public expected-output edit fail while the hidden case passed. |
| Deliberately wrong reference solution | NOT TESTED | The extension attempt failed before author authentication due to browser startup/navigation, so no wrong source was submitted. This is not counted as an app failure. |
| Python hints save/reload | PASS | Added two hints, saved, reloaded the step, and confirmed both persisted. |
| Python runtime limits and validation response | PASS | Saved limits and observed per-test results from the reference checker. Learner runner behavior is covered by the separate learner audit. |
| Author preview for theory/video/quiz/Python | PASS, limited | Opened all four step preview routes. External video playback remained unverified. |
| Publish validation and first release receipt | PASS | Completed a valid draft and published Version 1; receipt showed released version and editor/preview actions. |
| Second release and receipt | PASS | Edited and published Version 2 through the UI; receipt explicitly showed Version 2. |
| Existing enrollment pin after Version 2 | PASS | Roster showed Ada on `v1` after Version 2 was released. |
| New enrollment pin after Version 2 | PASS | Generated a new invitation through the UI; Alan accepted it through the browser. Read-only enrollment progress response reported `pinnedVersionNumber: 2`. |
| Course Settings version history | FAIL | After two successful releases, Settings → Publication & versions had zero `.version-item` rows and displayed the “No published versions yet”/private-draft empty state. See defect 1. |
| Student roster search/detail/revoke/reinstate | PASS | Filtered Ada, opened detail, canceled revoke, then confirmed revoke and reinstated access. |
| Invitation policy and share links | PASS | Generated one-use invitation through UI, saw it in Invitations, and accepted it in learner browser. Empty email field was browser-blocked; no email was sent. |
| Course analytics/version filter | PASS | Analytics page rendered; version selector was present and used. |
| AI connections token workflow | PASS | Created selected-course token, verified masked secret, toggled reveal/hide, opened setup guide, and revoked token. Secret was not logged. Private owned-course restriction separately passed focused repair test. |
| Validation issue editor links | NOT TESTED | The focused checker found no invalid destination when links were present, but did not record a nonempty issue-link set or click an actual blocker link. Do not treat link repair as fully revalidated here. |
| Agent activity/recovery UI | BLOCKED / NOT TESTED | A browser attempt used a service-created snapshot but a manually inserted synthetic activity record, then failed with a foreign-key error after learner assessment. Because the mutation did not come from a real authorized tool call, that UI result is excluded. The separate faithful service reproduction below confirms the assessed-progress failure independently. |
| Learner report context repair | PASS | Focused browser check submitted a report with visible course/version/step context and corroborated the stored record. |
| Admin audit filter/pagination repair | PASS | Focused browser check filtered 30 fixture events to a ten-row page and navigated to page two. |
| External email, provider playback, mobile/accessibility | NOT TESTED | No external messages were sent; video host playback, mobile, screen readers, zoom, and exhaustive keyboard-only use were outside this desktop-local run. |

## Confirmed defects

### 1. Course Settings omits published-version history — MEDIUM

Reproduction: create and publish Version 1 in the browser; enroll Ada through a one-use link; publish an edited Version 2; then open Settings → Publication & versions. Both release receipts were correct. Ada remained on Version 1, and Alan, who accepted a new link after the second release, was pinned to Version 2. Despite the two releases, the settings section contained zero `.version-item` rows and showed its no-releases/private-draft message.

The application source corroborates the UI result: `CourseSettingsPage` renders history from `course.versions`, but the author course response supplies current version fields without the version list. Evidence is in [broad action results](evidence/2026-10-06-author-full-reaudit3-actions.json), especially “Publish second version while learner remains pinned to Version 1,” and screenshots `18-version-2-receipt_{dark,light}.png` and `18-course-version-history_{dark,light}.png`.

### 2. Recovery restore fails when existing progress references steps — HIGH

Root’s fresh-database service diagnostic used a normal snapshot created by `DraftRecoveryService` and restored it at the current draft revision. The course had two `step_progress` rows and no assessment attempts. Restore attempted to hard-delete step rows, which learner progress references with `ON DELETE RESTRICT`; SQLite rejected it with `FOREIGN KEY constraint failed`. The transaction rolled back, leaving title and draft revision unchanged. This means authors cannot restore a saved draft revision once learner progress references the steps. See [the diagnostic](evidence/2026-10-06-root-recovery-diagnostic.json).

This service result is distinct from the audit’s browser recovery attempt. The browser fixture manually recorded an activity mutation and had a real learner attempt, so that attempt is not used as defect evidence.

## Repair outcomes

- **Publication false-failure message:** FIX VERIFIED. Both browser publish actions led to truthful Version 1 and Version 2 receipts.
- **Theory asset upload:** FIX VERIFIED. Actual PNG upload, Markdown insertion, save, and authorized preview all succeeded.
- **Reference-check comparator/current test handling:** FIX VERIFIED for a passing correct solution and current unsaved public-test change. The successful browser run showed per-test rows. Deliberately wrong reference input remains NOT TESTED live.
- **Python hint persistence:** FIX VERIFIED by save and reload.
- **Selected-course token picker:** FIX VERIFIED for an owned private course; issued token showed the selected-course restriction.
- **Course/version handling:** Enrollment snapshot pinning passed for an old learner and a new learner; history display is still defective as described above.
- **Recovery:** Service-level restore defect confirmed for courses with learner progress; browser UI flow was not revalidated with an actual authorized tool mutation.

No user interface redesign recommendations were added. External emails and publication outside the isolated fixture were not used.
