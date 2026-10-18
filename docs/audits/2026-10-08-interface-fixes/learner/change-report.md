# Learner Interface Fixes (L1–L8) Change Report

**Execution Date:** 2026-10-08  
**Scope:** Learner-Facing Defects L1–L8 from `docs/audits/2026-10-06-interface-review/learner-plan.md`  
**Base Worktree Commit:** `2211878`  
**Total Fresh Screenshots:** 54  
**Total Interaction Steps:** 50 (50 Passed, 0 Failed)

---

## Changed Files Summary

1. `packages/web/src/pages/learning/MyCoursesPage.ts`
   - Added `activeFilter?: 'in_progress' | 'completed' | 'all'` to `MyCoursesPageOptions`.
   - Filtered active courses by completion state based on validated filter parameter.
   - Updated tab styling and `aria-selected` attributes to match the requested filter.

2. `packages/web/src/main.ts`
   - **L1**: In `loadS2Page('P10')`, parsed and validated the `filter` query parameter from URL, passing `activeFilter` to `renderMyCoursesPage`.
   - **L2 & L4**: In `loadAttemptHistory`, parsed real course progress via `parseLearningNavigation`, derived scoped sidebar visibility, passed real modules, task squares, course progress, parent exercise selection, and preserved list query offset (`allAttemptsUrl`) to `renderAttemptHistoryPage`. Wired `attachLearningShellListeners`.
   - **L3**: In `loadPythonWorkspace`, `loadLessonStep`, and `renderEnrolledQuiz`, derived scoped curriculum sidebar collapsed state via `getCurriculumSidebarCollapsed` and supplied `isSidebarCollapsed` to `LearningWorkspaceShellOptions`.
   - **L5**: Attached full accessible modal lifecycle for `#exercise-report-dialog`, marking sibling elements `.learning-task-strip` and `.learning-body` `inert = true` while open, trapping Tab and Shift+Tab key events strictly within focusable dialog elements, and restoring background inertness and trigger focus on Escape/close.
   - **L6**: Updated `attachProfileListeners` to preserve typed display name drafts in `sessionStorage` (`zur_profile_draft_${user.id}`) on input, and restored it on reload or save failure. Updated `window.addEventListener('popstate')` to prompt users with unsaved changes; when cancelled, preserved the profile route in history and kept the typed draft intact without silent loss.
   - **L7**: Passed current user context to `renderSafeDenialPage` on 404/403 course overview denial, preserving the authenticated `shell-app` with navigation, user avatar, and exits (Browse courses, Go back) for logged-in users while rendering `shell-public` for anonymous users.
   - **L8**: Tested and verified execution modes.

3. `packages/web/src/pages/learning/learning-navigation.ts`
   - Implemented scoped persistence helpers: `getScopedSidebarCollapsedKey`, `setCurriculumSidebarCollapsed`, `getCurriculumSidebarCollapsed`, `getScopedModulesExpandedKey`, and `getScopedSidebarScrollKey`.
   - Updated `updateMountedLearningWorkspace` to preserve `isSidebarCollapsed` and `inert` on fast-path and full task strip replacements.

4. `packages/web/src/components/shells/LearningWorkspaceShell.ts` & `packages/web/src/styles/shells.css`
   - Added `isSidebarCollapsed` option to `LearningWorkspaceShellOptions` and `renderTaskStripHtml`.
   - Collapsed aside receives `class="learning-course-sidebar collapsed" inert`, and toggle button receives `aria-expanded="false"`, `title="Show modules"`.
   - Converted `#exercise-report-dialog` to native `<dialog class="dialog-overlay modal-dialog">` with `::backdrop` styling.

5. `packages/web/src/pages/learning/AttemptHistoryPage.ts`
   - Removed placeholder `<nav class="outline-nav"><ul><li>History</li></ul></nav>`.
   - Added real curriculum modules, task strip, course progress, and parent exercise selection.
   - Gave detail view the exact same `attempt-history-container` responsive wrapper as list view (800px max width, centered).
   - Wrapped submitted code snapshot in horizontal scroll surface with literal newlines preserved.
   - All attempts link preserves query offset (`opts.allAttemptsUrl`).

6. `packages/web/src/pages/learning/PythonWorkspacePage.ts`
   - Result mode badge uses `Test samples` for sample execution, matching the toolbar button label.
   - Plain execution (`Run`) outputs plain stdout/stderr in `program-output` without correctness implication.
   - Official grading (`Submit`) displays `Submit (Graded)` with full assessment verification.

7. `packages/web/src/pages/status/SafeDenialPage.ts`
   - Added `user?: any` option.
   - When `opts.user` is provided, renders inside `renderAppShell`, preserving authenticated layout and exits.

8. `packages/web/tests/learner-l1-l8-interface-fixes.test.ts`
   - Created comprehensive behavioral unit and integration tests covering all 8 defects (8/8 passing).
