# ZUR author real-user audit

**Date:** 2026-10-05  
**Scope:** Author-visible course management, structure and content editing, preview, publication, enrollment/student operations, invitations, analytics, AI tokens, and recovery UI.  
**Environment:** Isolated temporary SQLite database, API, Vite app, worker, and dedicated Chrome profile; desktop 1440×900, dark and light themes. Interactions used visible UI controls with CDP mouse and keyboard events. Browser screenshots were captured in both themes. No shared/production data was changed and no external emails or publications were sent.

## Result

Most course authoring and lifecycle operations worked through the browser. Five actionable defects were confirmed: publication reports failure after the server publishes successfully; the theory asset-upload control is inert; Python reference-solution checking gives no response; Python hints do not persist; and selected-course AI token scope has no course picker. The learner-facing audit is documented separately in [the learner audit](2026-10-05-learner-real-user-report.md).

The main publishing diagnostic is especially important: the author clicked Publish on a valid course, the API returned HTTP 200 with a version 1 receipt, but the screen displayed “Publication failed.” The backend release happened. This is a false failure message, not a rejected publication.

## Method and evidence

The primary author journey created and edited disposable courses through the UI. Separate targeted browser runs tested the valid minimal publish receipt and author support features on an isolated seeded published course. API/database reads were used only to corroborate results after visible interactions. A recovery snapshot and activity mutation were prepared directly in the isolated fixture, then the activity, diff, and restore confirmation were exercised in the browser; this is not counted as browser-created recovery data.

Evidence files:

- [Minimal publication diagnostic actions and network receipt](evidence/2026-10-05-author-publish-diagnostic.json)
- [Student, invitation, analytics, and token support actions](evidence/2026-10-05-author-support-diagnostic.json)
- [Dark and light author screenshots](../../screenshots/audit-2026-10-05/author/)

Screenshots use matching base names with `_dark.png` and `_light.png`, including `01-course-list`, `04-course-builder-structure`, `05-theory-editor`, `publish-diagnostic`, `support-02-roster`, `support-03-shareable-link`, `support-05-analytics`, and `support-06-token-scope-form`.

## Functional inventory

| Feature | Result | Browser actions and evidence |
|---|---|---|
| Course list, status filters, search | PASS | Visited the list, used draft/published filters and title search, observed updated route/results and empty state. Screenshot `01-course-list`. |
| New course and required validation | PASS | Opened new-course dialog; empty title was blocked by required validation; then created a uniquely named draft. |
| Course settings and metadata save | PASS | Edited title, description, outcomes and access/enrollment settings; saved and reloaded values. Screenshot `02-course-settings`. |
| Archive, restore, delete | PASS | On a separate disposable draft, archived and restored; opened delete, canceled once, then confirmed. Screenshot `lifecycle-*`. |
| Module create, rename, delete, reorder | PASS | Created modules, renamed and reordered them through visible controls; reloaded and confirmed order; canceled/confirmed a disposable module deletion. |
| Lesson create, rename, delete, reorder | PASS | Created, renamed, reordered, reloaded, and deleted disposable lessons via visible controls. |
| Step create, edit, duplicate, delete, reorder | PASS | Created theory/video/quiz/Python steps and an extra theory step; reordered and reloaded; duplicated a step; canceled then confirmed duplicate deletion. |
| Theory text formatting and preview | PASS | Edited Markdown, switched to Preview and confirmed bold/list rendering, returned to Edit, saved. Screenshot `05-theory-editor`. |
| Theory image/asset upload | FAIL | Clicked visible **Upload asset** button; no picker, modal, or file input appeared. See defect 2. |
| Video authoring and preview | PASS, limited | Entered approved YouTube URL, transcript, and captions; saved indicator appeared and preview showed transcript. Actual external-provider playback was not confirmed. |
| Quiz options, single/multiple answers, explanation | PASS | Added three options, changed single to multiple correct-answer mode, selected two correct answers, saved explanation, and previewed. No quiz-specific hint editor was found. |
| Python problem, starter/reference code, tests, limits | PASS, limited | Entered problem/input/output/constraints, starter/reference source, two public and two hidden cases, hints and runtime limits, saved. The publish review later still claimed there were no learner hints; see defect 4. |
| Python reference-solution check | FAIL | Clicked **Check reference solution**; no visible activity or result appeared. See defect 3. |
| Learner preview for all step types | PASS, limited | Opened theory, video, quiz, and Python step previews. Video provider playback remained unverified. |
| Publish validation and confirmation | PASS, limited | Review displayed required-field blockers; filled description and outcomes, saved, and review then showed zero blocking errors. Confirmation showed version impact. |
| Publish server operation | PASS | In the minimal valid course, actual UI Publish click produced a captured `POST /api/author/courses/{id}/publish` HTTP 200 and JSON receipt with `versionNumber: 1`. |
| Publish UI receipt | FAIL | Same click left the review and confirmation visible and showed a generic failure despite the successful receipt. See defect 1. |
| Student roster/search/detail/revoke/reinstate | PASS | On seeded published course, filtered roster for Ada, opened learner detail, canceled revoke, confirmed revoke, then reinstated; status returned to Active. Screenshot `support-02-learner-detail`. |
| Email invitations | PASS, limited | Empty required email was blocked in the browser. No email was sent. |
| Shareable invitation and acceptance | PASS | Generated one-use link with maximum use 1, saw it listed under Invitations, then signed in as seeded learner Ada and accepted through the visible join page. Screenshot `support-03-shareable-link`, `support-04-join-invitation`. |
| Enrollment policy/access | PASS | Changed between Public/Open and Unlisted/Invitation-only in course settings and saved. |
| Analytics | PASS, limited | Opened analytics and inspected enrollment and exercise insight tables. A version filter was not present in the observed UI, so filtering by version was not tested. Screenshot `support-05-analytics`. |
| AI token creation, reveal/hide, guide, revoke | PASS | Created all-owned token, observed it masked by default, toggled reveal/hide, opened setup guide, and revoked. Token value was not recorded. |
| Selected-course AI token scope | FAIL | Selected the UI’s selected-course scope; its picker was absent even though a published course was available. The UI fetch to `/api/courses` returned an error; the catalog endpoint is `/api/courses/catalog`. See defect 5. |
| Activity/recovery UI | PASS, fixture-prepared | Created a recovery snapshot and activity mutation directly in isolated fixture services, then used browser activity page, diff, restore confirmation, and confirmed restored metadata. Not a full browser-authored activity event. |
| Version history and pinned version after a new release | NOT TESTED | The false publish receipt interrupted the normal author flow before a second release and fresh pinned-enrollment comparison. The seed already contained versioned enrollment data, which is not fresh author-browser verification. |
| Media upload/playback error handling | NOT TESTED | Theory upload control was inert; no successful asset could be uploaded. External video playback and provider failure recovery were outside the verified local environment. |
| Reorder persistence | PASS | Module, lesson, and step order were changed through UI controls and verified after reload. Drag-and-drop behavior was not tested. |
| Browser errors | LIMITED | Support run logged several generic 404 resource messages. Only the `/api/courses` token-picker request was directly tied to a confirmed product issue; the remaining 404s were not assigned defects without request attribution. |

Harness waits/click attempts that timed out during earlier runs were not counted as application failures. The click helper scrolls targets into view and checks hit-target overlap in the successful runs.

## Confirmed defects

1. **HIGH — Publish succeeds but the UI reports failure.** On a minimally valid draft, the visible Publish action returned HTTP 200 with a valid Version 1 receipt (`versionId` `ba6fd26e-fd27-4245-9cba-829ef02efb3f`), while the page displayed “Publication failed” and remained in the confirmation flow. Browser console had no errors. Source diagnosis from the application owner: `renderCoursePublishPage` is imported locally inside the review loader, while the separate publish-success handler calls it without a binding (`main.ts` around lines 1537 and 1581), causing a caught `ReferenceError` after the server has published. Reproduction: create valid draft → save description/outcomes → Review & publish → Publish → observe HTTP 200 receipt plus false failure message. Evidence: `publish-diagnostic` dark/light screenshots and the network record in the publication diagnostic JSON.

2. **HIGH — Theory “Upload asset” does nothing.** Reproduction: open a theory step and click the visible Upload asset control. No chooser, modal, or input appears. This blocks authors from adding images through the apparent editor affordance. Evidence: theory editor screenshots and the action log in the full author run.

3. **HIGH — Python reference solution cannot be checked from its visible control.** Reproduction: open Python step, enter reference code, click **Check reference solution**. No visible output, error, spinner, or panel change appeared. Authors cannot tell whether their reference answer passes the public cases. Evidence: Python editor screenshot/action log.

4. **MEDIUM — Python hints are typed but not saved.** Reproduction: enter two hints in the author editor, save, then open publication review; review reports “Python exercise … has no hints for learners.” This can result in publishing content without the support the author thought they added. Evidence: Python editor and publish-review action log. The quiz editor also exposed no quiz-specific progressive-hint control; that appears to be an absent capability, not a separately reproduced persistence defect.

5. **MEDIUM — Selected-course token scope cannot select any courses.** Reproduction: open token creation and choose Selected courses. The picker is not rendered although a published author course exists. The UI requests `/api/courses`, which returns an error; the catalog route is `/api/courses/catalog`. All-owned token creation and revocation worked. Evidence: `support-06-token-scope-form` and support diagnostic JSON.

## Usability recommendations

These proposals are separate from confirmed functional defects. Priority indicates user impact: P0 blocks trust or safe completion, P1 causes substantial confusion or rework, P2 improves clarity and efficiency.

1. **P0 — Make publish feedback match the server receipt.** The Review & publish confirmation showed a successful-ready state, then a false failure after publish. Show the release version and next step only after a successful receipt; if the receipt UI cannot refresh, explicitly say the release completed and provide a link to the released course. This prevents duplicate retries and uncertainty about whether students can access the release.
2. **P1 — Guide authors through a short creation sequence.** The new-course dialog creates a private draft and drops the author into a builder with multiple top-level destinations. Add a progress path: **Basics → Structure → Build steps → Preview → Publish** with a clear “next required action.” This helps a first-time author understand what to do after creating a course.
3. **P1 — Make the hierarchy visible while editing.** The builder exposes Structure and selected module/lesson/step views, but the relationship is easy to lose when moving among content pages. Show a persistent breadcrumb such as `Course › Module › Lesson › Step`, with the selected entity and “Add module / lesson / step” actions nearby. This helps authors predict where new content will be placed.
4. **P1 — Put a runnable check beside Python reference code.** The editor exposed **Check reference solution** without feedback. Present a clear Run reference solution action, the visible tests it ran, and per-case output. Keep hidden-test results summarized without leaking expected values. This gives authors confidence before publication and directly supports the “run before submit” expectation.
5. **P1 — Use consistent draft/save state on every editor.** Theory showed a Saved state while hints did not survive save. Show unsaved changes continuously, identify which fields were saved, and confirm persisted hint count after save/reload. This prevents silent content loss.
6. **P1 — Make validation actionable and tied to the field.** Review showed blockers and warnings, but the missing-hints warning contradicted the author’s recent editing. Add a concise checklist with status, exact field, and a direct “Edit” link; refresh it immediately after a successful save.
7. **P2 — Clarify student access and invitations.** The roster and Invitations are separate destinations. Add a small explanation of invitation states and whether access is active, pending, revoked, or expired near the list filters. This makes link-based and email-based access easier to manage.
8. **P2 — Explain token scope before creation.** The selected-course option rendered without a picker. Explain what each scope grants and show eligible courses before token generation; keep the one-time secret state and revoke action clearly labeled.
9. **P2 — Explain analytics coverage and version basis.** The analytics table labeled the latest release and last-seven-day activity, but no version filter was observed. Add a visible version selector and a short note describing which learners and attempts count.

### Five strongest quick wins

1. Fix the publish success handler so the receipt UI refreshes after a successful server publish.
2. Replace inert Upload asset with a working chooser and visible upload progress/result.
3. Make Python reference checking return per-test feedback in the editor.
4. Persist hints and show a saved hint count after reload.
5. Add the missing course list to selected-course token scope, then show scope summary before issuing the token.

### Suggested author journey

**Create a private draft → complete title, summary, outcomes, and access basics → add a module, lesson, and step with the hierarchy visible → choose a step type and save → preview as a learner → for Python, run the reference solution against public tests and review hidden-test summary → resolve a clickable publish checklist → publish and see the actual version receipt → invite learners or create a share link → monitor roster and analytics.** Keep recovery and AI tools available in clearly named secondary areas so they do not compete with the main authoring path.

## Limits

This audit focused on author-visible desktop flows. It did not test mobile/responsive layouts, browser zoom, screen readers, external email delivery, external video playback, successful media upload, analytics version filtering, or a fresh second-release/pinned-enrollment comparison. The publication false-failure blocked the normal post-publish continuation; the publish endpoint itself did return a receipt. No product source was changed during the audit. Isolated services and browser processes used by these runs were stopped after evidence collection.
