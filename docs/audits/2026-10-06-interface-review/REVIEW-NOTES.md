# Interface review working notes — 2026-10-06

Analysis only. Existing product work was committed as 0998ec0 and pushed at the user's explicit request; this review introduces no product implementation. Current screenshots/ contents were deleted without inspection as requested. Historical evidence under docs/audits/ remains intact. New captures are delegated to agy, gemini-3.8-flash-high, using isolated fixtures. Executor claims require independent artifact review.

## Selected recommendations (read before prior role findings)

From the recommendations section of 2026-10-05-real-user-audit-report.md: retain truthful publication/assessment state, distinct Run/Test samples/Submit, consistent course progress and stable lesson navigation, validation links to offending fields, focused administrative confirmations, actionable recovery, filter count/chips/reset, and accurate privacy lifecycle wording. These support principles 2, 3, 7, 9–13, 15 and complete journeys. Guided author progression is useful only where current flows demonstrate a missing next action. Do not revive fixed defects or prescribe extra permanent explanatory text. No fresh publication is authorized for this review.

## Review boundary

Strict learner → author → admin → public/account. Each group's plan and coverage must be saved before viewing the next group's screenshots. Coverage is route/state/theme specific; inspected code and historical evidence do not substitute for live verification. No global interface pass is claimed. Exclude terminal summaries and browser error pages.

## Initial learner source findings to verify against fresh captures

- AttemptHistoryPage supplies a literal History placeholder as its course outline, with no modules or task squares; loadAttemptHistory replaces the workspace shell wholesale. Compare workspace → attempts → detail → return and pagination context.
- Sidebar visibility is toggled only in the DOM. Reload/leave-and-return persistence needs a live check; module expansion and sidebar scroll are session-stored separately.
- Learning report modal moves focus to details and supports Escape, but its listener does not contain Tab focus. Test keyboard escape into background controls before accepting a confirmed defect.
- Profile dirty guard is checked for intercepted links, while popstate checks only appearance settings. Test profile text loss through browser Back.
- Existing main-page exit points to /learn; authenticated catalog loading, loaded, filters and service error use renderDiscoveryShell. Preserve these corrections if live checks agree.

## Pre-push checks

68 application/test files staged; no generated/data paths and no common credential-pattern matches. Production build passed. Full npm test: 661 tests, 659 passed, two failed because the requested screenshots cleanup removed legacy screenshot evidence and evidence.json. No test logic was altered to conceal this limitation. Historical captures, raw diagnostics, session metadata, scratch files and ad hoc scripts were left out of the push.

## Learner verification and acceptance candidates

These are source-backed candidates, not yet accepted change-plan entries.

1. My Courses tab URLs: loadS2Page(P10) does not pass activeFilter from the query to renderMyCoursesPage. Verify clicking Completed/All changes rows and selected tab, not only the URL. If confirmed, derive selection from a validated filter query, retain counts/flat rows, and check Back/Forward/reload. No new filter system needed.
2. Attempts: preserve the real module/lesson tree, selected exercise task square, and course progress when opening list/detail. Keep dedicated Back to workspace and restore confirmation. Confirm pagination returns to the same list position rather than page one, and that draft code survives list/detail return. Required captures: list, detail, restore dialog, empty, pagination, service failure in both themes.
3. Sidebar visibility: retain left-positioned Modules toggle; persist visibility by user/enrollment/version if reload and return currently reset it. Test collapsed → different lesson: a newly rendered strip must reflect aria-expanded=false and Show modules while the sidebar remains inert. Preserve module details and independent sidebar scrolling.
4. Reporting: retain contextual report, unchecked code attachment, concise errors, Escape and trigger-focus restoration. If Tab escapes the visible dialog, use a real modal lifecycle with background inertness, contained Tab/Shift+Tab and one active key handler. Exercise report failure must preserve the entered description and consent.
5. Profile Back: retain explicit Save, field labels and current link guard. Verify browser Back while dirty or saving; if it loses text, route all navigation through one guard and preserve text on cancel/retry without corrupting history.

No speculative cosmetic changes are proposed for readable split-pane instructions/code, distinct Run/Test samples/Submit, truthful stdout, green task completion, native selected quiz controls, or the corrected dashboard return/Explore shell.

## Author review candidates (after learner plan/inventory were saved)

Current editor link navigation already attempts to save dirty edits before leaving; do not revive a blanket claim that every author link discards work. Back/reload and failed/edited-during-save paths still need native checks.

- Python preview duplicates learner programming markup and retains a filename/runtime toolbar and disabled Run samples/Submit solution controls. Current learner uses compact top-strip execution controls. Confirm fresh preview before proposing shared read-only workspace rendering; preserve honest execution-unavailable semantics and Back to editor.
- AuthorCourses new-course error handler redraws a form with no retained title value. Confirm a controlled API failure preserves or loses the entered title. Status filter links omit the current search query.
- Course publication already groups named exercise blockers and provides Edit tests/Edit step and real retry; retain that functional structure. Several repeated blocker/next-action descriptions may be a supported copy simplification, not evidence of a broken validation flow.
- AuthorCourses includes a second main with id=main-content within AppShell's main; verify duplicate landmarks/IDs in live DOM.
- Historical independent author frames predate the learner minimal/navigation correction and are not current preview layout evidence.
