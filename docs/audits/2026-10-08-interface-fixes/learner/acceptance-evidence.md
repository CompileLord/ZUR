# Learner Interface Fixes (L1–L8) Acceptance Evidence

**Execution Date:** 2026-10-08  
**Audited Against:** `docs/audits/2026-10-06-interface-review/learner-plan.md` and `principles-recheck.md`

---

## Issue-by-Issue Verification

### L1 — My Courses Requested Filter Agreement
- **Observed Behavior:**
  - `/learn/courses?filter=in_progress`: In progress tab is active (`aria-selected="true"`), displaying only unfinished enrollments.
  - `/learn/courses?filter=completed`: Completed tab is active, displaying finished courses with completion badges.
  - `/learn/courses?filter=all`: All tab is active, showing both in-progress and completed courses.
  - Empty completed view displays helpful guidance (`No completed courses yet. Keep learning to finish your enrolled courses!`) with an Explore catalog link.
- **Evidence Screenshots:**
  - `learner-l1-mycourses-in-progress-dark.png` / `...-light.png`
  - `learner-l1-mycourses-completed-dark.png` / `...-light.png`
  - `learner-l1-mycourses-all-dark.png` / `...-light.png`
  - `learner-l1-mycourses-empty-completed-dark.png` / `...-light.png`

### L2 & L4 — Curriculum Context & Responsive Inset in Attempts
- **Observed Behavior:**
  - Removed placeholder `History` sidebar. Real curriculum modules, lessons, course progress bar, and task strip are rendered.
  - Parent exercise task square is selected with `aria-current="step"`.
  - Detail view shares the exact same 800px max-width container (`attempt-history-container`) as the list view, eliminating jarring layout shifts.
  - Submitted code snapshot is horizontally scrollable (`overflow-x: auto; white-space: pre;`) preventing viewport-wide expansion while preserving literal newlines.
  - "All attempts" link preserves the list pagination offset (`?offset=...`).
  - "Restore to editor" opens explicit confirmation dialog (`#restore-confirm-dialog`) preventing accidental draft loss.
  - Attempt restore failure under controlled 503 displays in-dialog error guidance and retry option while keeping attempt context and code draft intact.
- **Evidence Screenshots:**
  - `learner-l2-attempts-list-dark.png` / `...-light.png`
  - `learner-l2-attempts-empty-dark.png` / `...-light.png`
  - `learner-l2-l4-attempt-detail-normal-dark.png` / `...-light.png`
  - `learner-l4-attempt-detail-narrow-1100-dark.png` / `...-light.png` (1100×900 narrow desktop)
  - `learner-l4-attempt-detail-long-code-dark.png` / `...-light.png`
  - `learner-l2-attempt-restore-dialog-dark.png` / `...-light.png`
  - `learner-l2-attempt-restore-failure-dark.png` / `...-light.png`

### L3 — Sidebar Visibility Persistence Across SPA Navigation and Reload
- **Observed Behavior:**
  - Curriculum sidebar visibility is stored scoped by `userId`, `enrollmentId`, and `courseVersionId`.
  - Collapsing the sidebar sets class `collapsed`, adds `inert` attribute to the aside element, and sets toggle button title to "Show modules" with `aria-expanded="false"`.
  - SPA navigation to another lesson/step preserves the collapsed state; the new task strip toggle correctly displays "Show modules" with `aria-expanded="false"`.
  - Full document reload (`Page.reload`) preserves the collapsed state before paint without visual flicker.
- **Evidence Screenshots:**
  - `learner-l3-sidebar-expanded-dark.png` / `...-light.png`
  - `learner-l3-sidebar-collapsed-dark.png` / `...-light.png`
  - `learner-l3-sidebar-persisted-spa-dark.png` / `...-light.png`
  - `learner-l3-sidebar-persisted-reload-dark.png` / `...-light.png`

### L5 — Report Modal Native Dialog & Contained Keyboard Focus
- **Observed Behavior:**
  - Report modal is implemented as a native `<dialog class="dialog-overlay modal-dialog" id="exercise-report-dialog">`.
  - While open, sibling background elements (`.learning-task-strip`, `.learning-body`) are marked `inert = true`.
  - Native CDP key event sequence of 12 consecutive Tab presses verified that focus remained strictly trapped inside the open dialog and never escaped to background DOM elements.
  - Code inclusion checkbox (`#report-include-code`) is unchecked by default.
  - Submission failure displays an inline alert while retaining the user's typed description and consent state.
  - Pressing Escape closes the dialog, clears background `inert`, and restores focus to the trigger element.
- **Evidence Screenshots:**
  - `learner-l5-report-modal-contained-dark.png` / `...-light.png`
  - `learner-l5-report-modal-error-retained-dark.png` / `...-light.png`

### L6 — Profile Navigation Guard on Native History Navigation & Save Recovery
- **Observed Behavior:**
  - Profile displayName input tracks dirty state via `ProfileGuard`.
  - Native browser Back (`history.back()`) triggers a confirmation prompt (`Page.javascriptDialogOpening`).
  - Dismissing the prompt (Cancel) leaves the user on `/settings/profile` with the dirty draft intact in the input without silent discard.
  - Save failure under controlled 503 displays visible error alert while preserving the typed draft for retry and keeping the Save button enabled.
  - Explicit confirmation departs once without history traps.
- **Evidence Screenshots:**
  - `learner-l6-profile-dirty-dark.png` / `...-light.png`
  - `learner-l6-profile-back-cancelled-dark.png` / `...-light.png`
  - `learner-l6-profile-save-failure-dark.png` / `...-light.png`

### L7 — Authenticated Course Overview Safe Denial
- **Observed Behavior:**
  - Authenticated request to nonexistent course overview (`/courses/nonexistent-course-id-999`) renders inside `shell-app`, retaining top navigation, sidebar, user avatar, and usable exits (Browse courses, Go back) without leaking unlisted course metadata.
  - Anonymous visitor to the same route renders in `shell-public` with public navigation and Sign in.
  - Controlled HTTP 500 error renders a recoverable service error view with retry action.
- **Evidence Screenshots:**
  - `learner-l7-overview-denial-auth-dark.png` / `...-light.png`
  - `learner-l7-overview-denial-anonymous-dark.png` / `...-light.png`
  - `learner-l7-overview-service-error-dark.png` / `...-light.png`

### L8 — Execution Mode Labels & Distinction
- **Observed Behavior:**
  - Workspace toolbar displays distinct actions: "Test samples", "Run", and "Submit".
  - "Test samples" results display the result mode badge "Test samples" (aligning with the button label, replacing "Run (Samples)").
  - "Run" results output plain program stdout in `program-output` without pass/fail badges or correctness implications.
  - "Submit" results display "Submit (Graded)" with assessment presentation semantics.
  - Results in this audit are generated via controlled presentation test fixtures. Official isolated grading and production execution timing are explicitly NOT claimed.
- **Evidence Screenshots:**
  - `learner-l8-results-test-samples-dark.png` / `...-light.png`
  - `learner-l8-results-run-plain-dark.png` / `...-light.png`
  - `learner-l8-results-submit-graded-dark.png` / `...-light.png`

---

## Explicit Boundaries & Limitations
- L8 job outputs and badges demonstrate controlled UI presentation only; production sandboxed runner isolation, execution latency, official grading, and historical receipt timing are not verified.
- Disposable SQLite database, browser profile, and Vite server were used exclusively.
- No git commits or pushes were made (Git ownership remains with Codex).
- Author, admin, and public workflows were preserved untouched and are excluded from this first learner batch.
