# Authoring and Course Lifecycle Browser Audit

**Date:** 2026-10-04  
**Scope:** Course create/read/edit/archive/restore/delete, module and lesson CRUD, step authoring, publication, invitation, and learner enrollment.  
**Environment:** Headless Chrome over Chrome DevTools Protocol, a fresh Vite/API pair, and a disposable SQLite database created by `scripts/verify-s2-browser-journey.ts`.

## Result

The final Chrome journey passed. It used the rendered author and learner pages to create and edit courses and structure, save all lesson types, duplicate and preview a step, publish, enroll through an invitation, and complete a course. It also confirmed course archive/restore/delete and module/lesson/step delete actions through the visible UI, including cancel and confirm branches for destructive structure actions. The learner completed 4/4 required steps (100%).

Reordering remains unavailable: the lesson page exposed zero reorder controls, and there is no matching reorder route in `packages/server/src/server.ts` even though service-layer reorder methods exist. No reorder action is claimed as tested.

## Browser UI coverage

| Area | Action | Result |
|---|---|---|
| Author access | Signed in as the seeded author and opened the course list. | Course list and create-course dialog rendered. |
| Course create/read/edit | Created “S2 browser draft”, opened its builder and settings, then saved updated title and metadata. | Course details loaded; changes persisted after re-render. |
| Module create/edit/delete | Created and renamed “Audit module”; opened its Delete control, cancelled once, then confirmed deletion. | Rename persisted; cancel preserved the module; confirm removed it. |
| Lesson create/edit/delete | Created a lesson with description, renamed it, cancelled deletion once, then confirmed deletion. | Rename persisted; cancel preserved the lesson; confirm removed it and its steps. |
| Step create/edit/duplicate/delete | Added theory, video, quiz, and Python steps; edited and saved content; duplicated theory; cancelled and confirmed deletion of the original. | Specialized editors showed Saved; duplicate appeared; cancel preserved the original; confirm removed it. |
| Step preview | Followed the preview link from the lesson table. | The link used `/preview?stepId=…` and loaded the author preview page. |
| Course lifecycle | Clicked Archive, Restore, and Delete draft in course settings. | Archived status exposed Restore; restore returned it to Draft; confirmed deletion returned to the course list. |
| Publish | Validated and confirmed the mixed course. | Version 1 publication receipt rendered. |
| Invitation/enrollment | Created a shareable invitation as the author and accepted it as Ada. | Learner overview showed the published mixed course and expected steps. |
| Learner completion | Completed theory and video, passed the quiz, and submitted Python code. | “Course Complete”, 4/4 required steps, and 100% progress rendered. |

Screenshots from the same Chrome journey: [author builder](../screenshots/S2-audit-author-builder.png), [publication receipt](../screenshots/S2-audit-published.png), [enrolled course](../screenshots/S2-audit-student-overview.png), and [completed course](../screenshots/S2-audit-student-complete.png).

The builder capture confirms the default module now reads **“Module 1: Introduction”** without the duplicated sequence label seen in the first run. The page uses a three-column author workspace with course tree, central overview, and inspector; the initial draft has one default module, one lesson, and one theory step.

## CRUD evidence and boundaries

Course creation, metadata edits, module/lesson creation and renaming, step content edits, duplication, preview, deletion, archive, restore, and course deletion were exercised through visible UI controls and forms in Chrome. Deletion tests used `window.confirm` overrides to explicitly drive both cancel and confirm outcomes. Course creation and edits used distinct “S2 browser draft” and “Audit lifecycle course” records in the test-only database.

At the end of the run, the DOM action inventory for a lesson contained one Duplicate form and four delete-related controls, with zero reorder controls. Module and lesson delete confirmation paths, as well as course lifecycle actions, were exercised through the page handlers. There is no HTTP reorder endpoint in the server router, so the missing reorder feature is not only a UI omission.

The browser journey's Python job worker claims and executes queued work against the temporary database; the learner's Run vs Submit affordance and broader Stepik visual comparison are not covered by this authoring audit and need the separate learner/UI review.

## Reproduction and result

Run `node --experimental-strip-types scripts/verify-s2-browser-journey.ts`. It launches a temporary API server, Vite, Chrome, and a disposable database and cleans them up in `finally`. The final run exited with status 0. The script now accepts the page’s “Course Complete” capitalization and includes CRUD cancellation/confirmation checks, preview routing, lifecycle actions, publish/invitation, and completion.
