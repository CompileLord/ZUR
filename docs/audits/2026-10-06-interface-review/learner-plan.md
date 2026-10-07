# Learner and shared authenticated navigation plan

Reviewed 2026-10-06 against commit 0998ec0. Analysis only; all changes below are **Proposed**. Codex independently inspected and decoded all 56 fresh learner images, including 11 supplement captures for native keyboard/history and catalog adverse states, and checked the capture harness against current rendering and navigation code. Screenshot root: `../../../screenshots/interface-review-2026-10-06/learner/`. Exact state records: [manifest](manifest.json); [coverage](learner-coverage.md). The executor returned ERROR despite producing artifacts; acceptance here is based on independent inspection.

Selected prior recommendations: truthful assessment, distinct execution controls, course-wide progress, stable curriculum navigation, actionable recovery, and preservation of work. Retain the accepted instructions-left/code-right workspace, task icons and green completion, compact execution bar, quiet successful autosave, and corrected main-page exit/authenticated Explore. Theory/video/quiz intentionally use a reading workspace rather than the programming split.

## L1 — Make My Courses reflect its requested filter

**Confirmed defect; P1; Proposed.** Route `/learn/courses?filter=completed`; evidence [requested Completed, rendered In progress](../../../screenshots/interface-review-2026-10-06/learner/learner-p10-mycourses-dark-completed-tab-defect.png), interaction 3, `main.ts` P10 loader and `MyCoursesPage.ts` filtering. Direct navigation leaves In progress selected and displays an unfinished course. This violates principles 9 and 13.

Retain the three tabs, counts, flat rows and resume/review actions. Parse and validate `filter` as `in_progress`, `completed`, or `all`, pass it to the renderer, and derive selected styling and rows from that value. Invalid/missing values use the default. Do not merely change the highlighted label. Shared dependency: route/query state; affected route P10 only. Implement before context refinements.

Acceptance: with completed and unfinished fixture enrollments, click each real tab and verify URL, selected label, counts and rows agree. Check empty Completed, unknown filter, Back, Forward, reload and direct links. Required after captures: every tab plus empty Completed, light and dark, 1440×900. No competing new filter controls.

## L2 — Preserve curriculum context throughout Attempts

**Confirmed defect; P1; Proposed.** Routes `/learn/:enrollmentId/steps/:stepId/attempts` and `.../attempts/:attemptId`; evidence [list](../../../screenshots/interface-review-2026-10-06/learner/learner-p16-attempts-history-dark-placeholder-sidebar.png), [detail](../../../screenshots/interface-review-2026-10-06/learner/learner-p16-attempt-detail-light-normal.png), interactions 16–17. The real modules, lesson progress and task squares are replaced by a literal History item. Both a main-page exit and Back to workspace already exist: the defect is loss of curriculum context, not absence of every exit. Principles 3, 6, 12 and 13.

Remove the placeholder. Supply real progress/navigation data through the existing parser and learning shell, selecting the parent exercise, and preserve its sidebar visibility/expansion. Keep the attempts list, verdicts, code snapshot, copy action, All attempts, Back to workspace and explicit restore confirmation. Keep Run/Test/Submit in the actual editor, not on history pages. Detail → All attempts should retain the list query/page; exercise return should retain the draft. Components: `AttemptHistoryPage`, `loadAttemptHistory`, `learning-navigation`, `LearningWorkspaceShell`; dependency on L3 state scope. Implement shared state first, then list/detail composition.

Acceptance: editor → list → detail → list → editor retains exercise, progress, sidebar state, list page and draft. Adjacent lesson/task links work from list and detail. Restore cancel preserves code; confirmed restore replaces only the intended draft; restore failure offers recovery without deleting it. Check empty list, multiple pages, long snapshots, denied attempt, loading and service error. Required after captures: list, detail, empty, pagination, restore dialog/error in both themes at 1440×900; one narrow desktop detail. No fabricated grading receipt.

## L3 — Preserve sidebar visibility across reload and return

**Confirmed reload/whole-document navigation reset; P2; Proposed.** Routes P12–P16. Evidence [collapsed](../../../screenshots/interface-review-2026-10-06/learner/learner-p15-python-sidebar-dark-collapsed.png), [expanded after document navigation](../../../screenshots/interface-review-2026-10-06/learner/learner-p12-theory-sidebar-dark-reset-defect.png), interaction 10. The harness uses CDP Page.navigate, so this establishes document-load persistence loss; it does not prove an ordinary SPA task click resets visibility. Source toggles only a DOM class. Principles 3 and 13.

Retain the left-positioned Modules toggle and existing independently scrollable curriculum. Store visibility by user/enrollment/version, restore it before layout paint, and derive class, inertness, title and aria-expanded from the same state. Preserve mounted fast navigation. When a different lesson replaces the task strip, its new toggle must describe the retained collapsed state. Scope module expansion and scroll similarly rather than sharing state between accounts/courses. Components: learning shell, mounted navigation updater and listener lifecycle. Implement before L2.

Acceptance: collapse → task click → another lesson → reload → dashboard → return → Back/Forward retains visibility for that enrollment. A different account/course has independent state. The toggle stays at the left and says Show modules with aria-expanded=false when collapsed; hidden links cannot receive focus. Check existing module expansion/scroll persistence, long syllabus and reduced motion. Required after captures: expanded/collapsed before and after reload/lesson return, both themes at 1440×900.

## L4 — Give attempt detail the same readable content inset

**Design judgment supported by current rendering; P2; Proposed.** Route attempt detail; evidence [light detail flush against sidebar](../../../screenshots/interface-review-2026-10-06/learner/learner-p16-attempt-detail-light-normal.png). The list uses an inset capped-width container, while selected detail renders directly at the pane edge. Principle 4; reading and scanning submitted code is harder when the heading, metadata and restore action abruptly change alignment.

Retain snapshot text and truthful verdict/runtime metadata. Put list and detail in a shared responsive content wrapper with consistent inset; let long code scroll horizontally in its own code area, keep the return/action area readable and avoid stretching every detail element across the viewport. Do not alter literal newline characters in stored code to conceal a malformed fixture. Components: AttemptHistoryPage and shared content spacing; implement with L2, not as a separate shell redesign.

Acceptance: opening detail retains the list's left inset, readable metadata and accessible actions at 1440 and 1100px; long code does not create page-wide overflow. Required after: light/dark detail, long code, restore dialog and narrow desktop.

## L5 — Contain keyboard focus in the report modal

**Confirmed with trusted CDP Tab events; P1; Proposed.** Shared learner report dialog on P12–P15; evidence [visible report after focus escape](../../../screenshots/interface-review-2026-10-06/learner/learner-p15-python-report-modal-tab-escape-focus.png), supplement log 1 and current listeners. Focus moves from details to consent/Submit/Cancel and then BODY outside the visible dialog. Principle 15.

Retain contextual reporting, the unchecked code attachment, useful error text and Escape/trigger restoration. Use a shared modal lifecycle with background inertness and contained Tab/Shift+Tab, preferably a native dialog where compatible. Do not mark a dialog ancestor inert or use aria-hidden as a substitute for preventing focus. Remove duplicate/unmanaged global key listeners when the shell unmounts. Components: LearningWorkspaceShell, report listeners and common Dialog; shared dependency S2 in the navigation plan. Implement before extending reporting surfaces.

Acceptance: cycle repeatedly in both directions, confirm activeElement remains within the open dialog; Escape and Cancel restore the trigger; hidden background controls are inert; failed submission retains description and consent, success is an actual API acknowledgement. Required after captures: open/error/success and visible focus at each edge, light/dark 1440×900, with trusted key log. Native Shift+Tab and screen-reader verification are still required.

## L6 — Preserve unsaved profile text during browser Back

**Confirmed with native Back/Forward; P1; Proposed.** `/settings/profile` → `/learn` → browser Forward. Evidence [original name after lost draft](../../../screenshots/interface-review-2026-10-06/learner/learner-p17-profile-dirty-back-discarded.png), supplement log 2, and independent Codex check in [live log](codex-author-live.json): a distinct typed draft reverted to the saved name and no dialog event occurred. Current popstate checks appearance but omits ProfileGuard. Principle 13.

Retain the existing ProfileGuard, explicit Save, field validation and current link guard. Apply one guarded navigation lifecycle to native history navigation, preserving draft state before a route render. Cancel restores the intended history position without adding arbitrary history entries or trapping Back; confirm departs once. Do not introduce a duplicate profile guard. Components: main navigation/popstate and profile guard; shared dependency S3. Implement before general draft-navigation refinements.

Acceptance: edit → Back → cancel retains text and route; confirm goes to the intended previous route; Forward is coherent; pending save and failed save cannot silently lose text. Check keyboard browser shortcuts and reload as well as clicked links. Required after captures: dirty form, confirmation/cancel, failed save and returned form, both themes at 1440×900, with actual navigation history/dialog log.

## L7 — Preserve authenticated context on unavailable course overview

**Confirmed; P1; Proposed.** `/courses` → `/courses/nonexistent-course-id-999`; evidence [dark unavailable overview](../../../screenshots/interface-review-2026-10-06/learner/learner-p03-course-overview-auth-dark-error.png) and light counterpart. Unlike loading/loaded/filtered catalog, the overview 404 replaces the app sidebar with public navigation and Sign in while the fixture session remains active. This is a remaining adverse-state gap in the navigation correction, not a recurrence of the fixed loaded Explore problem. Principles 9 and 12.

Retain the safe unavailable message, Browse courses and Go back. Compose it inside the authenticated role shell when a session is active, and inside the public shell for anonymous users; disclose no protected course metadata. This is shared change S1, with the author generic error case, rather than a second denial implementation. Acceptance: authenticated unavailable/denied views retain truthful account/navigation context and usable exits; anonymous denial retains public navigation; real 5xx overview retry retains filters/route; no permission leakage. Required after captures: authenticated and anonymous 404/403/5xx, both themes at 1440×900, with real return links and Back/Forward.

## Remaining evidence limits

- The initial executor's untrusted Tab and unexecuted Back claims were rejected. Native supplement and independent Codex history checks now confirm L5/L6. SPA task navigation retains sidebar collapse; the supplement filename/state text incorrectly describes a reset and is superseded by the checked inventory.
- Authenticated Explore loading/service error/no matches now have dark/light evidence and retain the shell. Overview 404 exposes L7. Actual overview service-error retry, enrollment from a new learner, code drafts across Back/reload, restore/cancel/failure, save conflicts and keyboard editor shortcuts remain unverified. Loaded Explore and main exits are retained.
- Execution UI captures show output, assessment and retry presentation. The harness permits a host-Python fallback and manually commits fixture job results; this does not independently establish use of the production isolated runner. Runner isolation, execution timing, correctness and full retry completion remain unverified in this review.
