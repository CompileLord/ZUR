# Author workspace provisional plan

Reviewed 2026-10-06 against commit 0998ec0. Analysis only; all changes below are **Proposed**. 35 fresh screenshots captured across P21–P31 and P43–P45 in both light and dark themes; inspected against route contract, live CDP fixtures, and current authoring rendering code. Screenshot root: `../../../screenshots/interface-review-2026-10-06/author/`. Exact state records: [author-manifest.json](author-manifest.json); [author-coverage.md](author-coverage.md).

Selected prior recommendations: truthful assessment, actionable validation links to offending fields, clean authoring progression without unnecessary noise, preservation of author work during failures, distinct non-destructive preview semantics, and accessible HTML landmarks.

---

## A1 — Remove duplicate `<main id="main-content">` landmark on Author Dashboard

**Confirmed defect; P1; Proposed.** Route `/teach`; evidence [author dashboard dark](../../../screenshots/interface-review-2026-10-06/author/author-p21-dashboard-dark-normal.png) and live DOM check in [codex-author-live.json](codex-author-live.json) (`mainCount: 2`, `mainIdCount: 2`).

`AppShell` already wraps the application body in `<main id="main-content">`. Inside `AuthorCoursesPage.ts`, the template renders a second nested `<main id="main-content" class="author-courses-container">`. This creates duplicate top-level landmark regions and duplicate DOM element IDs, violating WCAG 2.4.1 (Bypass Blocks), WCAG 1.3.1 (Info and Relationships), and HTML landmark uniqueness specifications. Screen readers announce ambiguous skip targets and multiple main regions.

Retain the page layout, course cards, status tabs, and create action. Replace the inner `<main id="main-content">` in `AuthorCoursesPage.ts` with a semantic `<section aria-labelledby="author-courses-heading" class="author-courses-container">` or `<div class="author-courses-container">`. Ensure only the shell's landmark receives the `#main-content` skip anchor. Components: `packages/web/src/pages/author/AuthorCoursesPage.ts`. Implement before other author layout refinements.

Acceptance: inspect `/teach` DOM in both themes; verify exactly one `<main>` element and exactly one element with `id="main-content"`. Verify skip link targets the true content shell. Required after captures: dark and light `/teach` at 1440×900 with accessibility landmark verification.

---

## A2 — Preserve search query when filtering course status

**Confirmed defect; P2; Proposed.** Route `/teach?search=Python`; evidence live check in [codex-author-live.json](codex-author-live.json). When an author types a search query (e.g. `?search=Python`) and clicks the "Draft" or "Published" status filter tab, the page navigates to `/teach?status=draft` or `/teach?status=published`, clearing the active search filter.

Toggling status should refine the active query rather than discarding it. Authors searching through larger catalogs lose their search context whenever they switch tabs.

Retain the status tabs, count badges, and course cards. When constructing status filter URLs, preserve existing `search` parameter values in the query string (e.g. `/teach?search=Python&status=draft`). Similarly, ensure searching preserves the currently active `status` filter unless explicitly reset. Components: `AuthorCoursesPage.ts` filter link builders.

Acceptance: enter search query → click Draft tab → verify URL contains both `search` and `status` parameters and courses matching both criteria are displayed. Click All → verify search string remains in input and URL. Required after captures: filtered + searched author dashboard in dark and light at 1440×900.

---

## A3 — Retain entered course title on creation service error

**Confirmed defect; P1; Proposed.** Route `/teach` course creation modal; evidence live fault check in [codex-author-live.json](codex-author-live.json). Under a controlled 503 service failure during course creation, the modal error handler re-renders the creation form with an empty title input, destroying author input.

Violates principle 13 (preservation of work). An author who enters a long or carefully considered course title must not lose that text if the backend rejects the request due to a transient error, validation failure, or network timeout.

Retain the modal dialog, title and slug inputs, submit button, and error display. In the error handler, pass the entered `title` and `slug` back into the form template, preserving focus on the error banner or offending field with an inline retry action. Components: `AuthorCoursesPage.ts` create modal handlers.

Acceptance: trigger controlled 503 on course creation → verify entered title is preserved in input field, error banner explains failure, and author can re-submit without retyping. Required after captures: error modal with preserved title, dark and light at 1440×900.

---

## A4 — Align author Python preview controls with unified workspace styling

**Candidate alignment; P2; Proposed.** Route `/teach/:courseId/preview?stepId=:stepId`; evidence [preview Python dark](../../../screenshots/interface-review-2026-10-06/author/author-p26-student-preview-python-dark.png) and live check in [codex-author-live.json](codex-author-live.json).

The learner Python workspace uses a compact top-strip execution layout. In contrast, the author student preview for Python exercises renders an older toolbar layout containing disabled `Run samples` and `Submit solution` buttons and a separate filename header. While disabling submission in author preview is correct (author preview must remain non-destructive), having two different workspace layouts causes visual inconsistency between author preview and actual student experience.

Retain the prominent preview banner, non-destructive practice semantics, and Back to Editor navigation link. Harmonize the preview exercise container with the current learner split workspace layout, disabling execution actions with an explicit tooltip or notification badge explaining that live evaluation is disabled in author preview. Components: `AuthorStudentPreviewPage.ts` and shared `LearningWorkspaceShell`.

Acceptance: navigate to author preview of Python exercise → verify layout matches learner split view while displaying preview warning strip and disabled execution controls. Check Back to Editor return link. Required after captures: dark and light preview Python exercise at 1440×900.

---

## A5 — Retain validation blocker deep-links in publication checklist

**Verified compliant structure; P3; Proposed.** Route `/teach/:courseId/publish`; evidence [review publication dark](../../../screenshots/interface-review-2026-10-06/author/author-p27-publish-review-dark-normal.png).

The publication checklist correctly aggregates syllabus requirements, validation warnings, and blocking errors. Crucially, each blocking error provides direct deep-link actions (`Edit step`, `Edit tests`) taking the author straight to the offending module or step editor.

Retain this grouping and direct linking structure. Ensure that when a blocking error is resolved and the author returns to the checklist, the validation status recomputes immediately. Components: `AuthorPublishPage.ts`.
