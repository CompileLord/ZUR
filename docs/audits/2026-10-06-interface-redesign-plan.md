# ZUR interface redesign plan

## Implementation status

Status: **Core changes implemented and locally audited — full specification partially complete** (2026-10-06). Executor: agy `gemini-3.8-flash-high`, learner scope. Track page-level completion, checks, and screenshot evidence in [implementation report](2026-10-06-redesign-implementation/learner/REPORT.md). Independent review, completed checks and remaining requirements are recorded in [Codex audit](2026-10-06-redesign-implementation/AUDIT.md). Agent self-check alone does not mark the plan complete.

Date: 2026-10-06. Deliverable: a concrete implementation plan, with grouped desktop evidence. Application changes are not part of this planning pass.

The first change should be a consistent learning workspace: a persistent module/lesson sidebar, a horizontal row of task squares, and the existing problem-left/code-right split. Keep navigation visible while the lesson changes. Put execution controls beside the editor and make completion immediately recognizable. Apply the same typography, spacing, controls, and state language across learner, author, and admin pages.

## Evidence and boundaries

- [Screenshot index](2026-10-06-desktop-design-review/INDEX.md): 57 saved PNGs, grouped into learner (17), author (13), admin (12), and public/shared (15). Fifty are 1440×900; seven are full-page desktop captures at 1440 width. PNG decoding, dimensions, hashes, and links were checked.
- The initial pass reviewed only the learner group, as requested. Following the request to plan the other pages, Codex reviewed 35 additional page states: all 13 author images; eight admin viewport images plus two full-page detail images; and nine public/shared viewport images plus three full-page images. Groups were reviewed separately. Full-page duplicates were used only when needed.
- Before opening any image, Codex read and selected recommendations from **“Make the interface easier to understand”** in [the requested audit](2026-10-05-real-user-audit-report.md). Its defect and other report sections were not used as current findings.
- Author/admin/public changes now have dedicated screenshot-based plans linked below. Their observed page states are distinguished from uncaptured routes and untested interactions. Those plans supersede the initial proposals for their respective groups.
- Agy's final session failed with a model-service network timeout. Its capture files survived in temporary/artifact storage and were copied into the repository. The screenshot task produced evidence, but agy's “100% successful” report is not accepted as a successful journey test.
- Important corrections: the video image has an unavailable embed; the execution image shows **Queued for checking**, not passed samples; the report dialog is on `/help`; navigation is at the bottom and the outline toggle is at the upper right. Runtime shown in the editor is Python 3.14.7, not the value stated in agy's notes. The original notes are labeled unverified.
- Existing transition tokens and hover transitions already exist in source. Static screenshots cannot establish animation quality or measured navigation speed. The plan targets continuity and useful feedback rather than claiming that there is literally no animation.

## Which recommendations to use

| Audit recommendation | Decision | Application |
|---|---|---|
| Trustworthy publication and save state | Keep as a prerequisite | Verify current repaired behavior first. Show “Saved” only after acknowledgement; display actual publication result/version. Do not assume the historical defect remains. |
| Clear Run versus Submit | Highest priority | One Run control with discoverable input mode; a separate Submit button; label results as sample run, custom run, or submission. |
| Consistent course progress and navigation | Highest priority | Persistent course tree and task strip; distinguish position, lesson completion, and total course completion. |
| Guided author workflow | Keep, simplify | One context-sensitive next action for incomplete new courses; a compact checklist available on demand. Avoid a permanent five-stage wizard on every editor. |
| Validation links and real test feedback | Keep | Link blockers to exact fields; show per-test reference results and persisted hint status. |
| Focused admin confirmations | Keep where missing | One selected action at a time; target, effect, reason, authentication, result, and audit link. Reuse existing dialogs that already work. |
| Error recovery and prefilled reports | Keep | Report from within the workspace; preserve drafts; make failed loading distinct from an empty result. |
| Catalog filter chips and count | Keep, later | Small discoverability improvement once navigation/workspace work is stable. |
| Privacy request status | Keep, later | Clear export/deletion state and a real next action. Only offer cancellation if the backend supports it. |
| Reauthentication timing and token scope summary | Keep as targeted polish | Preserve inputs; show server-provided retry timing and scope before token creation. |

Agy additionally suggested keeping outline scroll position: adopt it. Its suggestion to automatically scroll results after successful sample tests is rejected as the default because it can move the user's focus unexpectedly; open the result panel without moving the editor or page. A shortcut printed inside every button and extra audit filter chips are lower priority. A shortcut tooltip must work on keyboard focus and use the correct platform modifier.

## What the learner images show

| Evidence | Finding | Design response |
|---|---|---|
| `01-learner-dashboard`, `02-my-courses` | Very sparse pages; the main card gives a course name and progress but little immediate lesson context. | Add the next lesson/task title and one Resume action. Keep sparse content honest; do not fill the page with marketing or invented activity. |
| `03-course-outline` | Tall syllabus, repeated numbering, course version/description competing with the main learning action. | Compact expandable module/lesson rows; prioritize lesson title and completion. Move version detail into course information. |
| `04-step-theory` through `09-python-workspace-run-feedback` | Persistent app navigation disappears; outline is closed; there is no visible task-square strip. | Open course navigation by default on desktop and retain it across all step types. |
| `04-step-theory`, `06-step-quiz` | Reading and quiz panes use different widths; ordinal text repeats at top and bottom; actions are detached at the viewport bottom. | Shared content alignment, task strip, and a consistent content action area. |
| `07-python-workspace-editor`, `08-python-workspace-custom-input` | Useful split view, but three execution buttons occupy a distant bottom bar; input and results occupy competing tabs. | Retain the split; place Run/Submit in the editor toolbar; make input choice part of Run. |
| `09-python-workspace-run-feedback` | A raw job ID is prominent during queuing; the capture never reaches a terminal state. | Brief queued/running feedback; diagnostics behind Details. Verify final states separately. |
| `05-step-video` | Large broken/unavailable player region with a transcript below. | Accessible unavailable-media state and transcript fallback. The image does not establish why the embed failed. |
| `10-python-workspace-report-modal` | Reporting moves to the Help page and foregrounds an editable technical course ID plus explanatory text. | Contextual dialog over the task; human course/lesson labels; identifiers attached automatically. |
| `11-submission-history` | Empty history uses two separate statements about having no attempts. | One useful empty state and a Return to task action. |
| `12`–`15` settings | Repeated explanatory columns, helper text, and technical phrasing dominate otherwise simple forms. | Compact labeled sections with help only where it affects a decision. Keep theme previews and necessary consequences. |

## Shared design and interaction rules

Retain the existing ZUR identity and citron accent while making the structure more deliberate. Use the existing semantic palette: green for completed/passed, citron for selection and primary action, amber for attention, red for failure/destructive actions. Completion must also have a checkmark and accessible label. A completed task can still be the selected task: display both states together.

Use a common 4/8px spacing rhythm, 40px standard controls, 32px compact secondary controls, 8px control corners, and 12px card/dialog corners. Target 16px reading text, 14px application controls, and 13px supporting metadata; retain user-adjustable editor sizing. Use subtle borders to separate panels instead of outlining every label or nesting unnecessary cards. Keep the code editor's syntax styling related to the rest of the theme.

Give each page one clear heading and each local action group one obvious primary action. Show Learn, Teach, and Admin as capability-aware destinations with an explicit current role. Do not crowd a learner screen with author/admin actions. Shared settings should respect capability visibility; investigate the AI connections tab visible in the learner capture before retaining it for learner-only accounts.

For speed, preserve the current shell while content changes. Keep sidebar scroll, expanded modules, selected lesson, editor split width, and result-panel size. Cache course structure by enrollment/version and reconcile completion after server responses. Cancel/ignore stale route requests. Preserve local drafts and save acknowledgement ordering; never let an old response overwrite the next step's editor. Avoid remounting CodeMirror for tab switches or result updates.

Reuse current motion tokens: about 120ms for button/focus feedback, 140–180ms for panels/dialogs, and 160ms for step-content transitions. Animate only the changing region, primarily opacity and a small transform. Do not animate the whole workspace, typing, or every output line. Respect reduced-motion preferences and keep navigation usable before animation finishes. These durations are design targets, not measured current performance.

## Learning workspace specification

At 1440×900, use a 56px shared header, approximately 248px persistent course sidebar, and a 56px task strip above the main content. The remaining coding area starts around 460px for the problem and 732px for the editor/results, adjustable with a keyboard-accessible divider. Keep at least 360px for the problem and 480px for the editor. When desktop width cannot sustain those minimums, offer a compact/collapsible course sidebar; no mobile capture is needed for this review.

```text
┌ ZUR / course                         lesson context          account ┐
├ Modules & lessons ──┬ Task squares: [✓] [✓] [3] [4]       ‹     › ───┤
│ Module 1            │ Problem title        │ main.py · Saved         │
│  Lesson A  2/4      │ Statement            │ Input: Samples ▾         │
│  Lesson B  0/3      │ Input / Output       │ Run       Submit         │
│ Module 2            │ Examples             │ Code editor              │
│                     │ Hints ▸              ├ Results / Attempts ──────┤
│ Course progress     │ Report issue         │ Run status / output      │
└─────────────────────┴──────────────────────┴──────────────────────────┘
```

**Sidebar behavior.** Modules expand into lesson rows. Clicking a lesson opens its last visited task, falling back to its first incomplete task, then its first task. Resume course uses the course-wide first incomplete required task. Preserve pinned course version and existing access rules. Highlight the active lesson and scroll it into view only if it is outside the sidebar viewport. Remember a deliberate collapse.

**Task squares.** Show the current lesson's steps as 36–40px square targets with short ordinal/type cues. Completed squares are green with checks; selected squares have a distinct outline; incomplete squares use a neutral surface. Failed attempts do not become completed. Waived and locked states remain distinct and clearly labeled. Long lessons scroll the strip horizontally and keep the active square visible. Click or keyboard activation navigates directly; previous/next links remain accessible. Screen-reader names include task number, title, type, and state. Do not hide titles exclusively in pointer-only tooltips.

**Progress meaning.** Course progress says “1 of 7 completed”; position says “Task 4 of 7” only when the scope is actually course-wide. The lesson strip uses lesson-local numbering. Labels must explicitly distinguish these scopes. Green completion follows server-acknowledged completion rules; running samples/custom input never grades a step. Update sidebar, task strip, and course overview from the same progress model.

**Problem pane.** Present title, statement, input/output, examples, then collapsed hints. Keep necessary constraints and authored teaching content. Remove repeated task type/ordinal lines when the task strip supplies them. Do not delete user-authored lesson text because it looks verbose. Pin neither huge descriptions nor repeated report links. Keep the report action consistently in the same secondary location.

**Editor and run controls.** Use a small editor header with `main.py`, runtime version, save state, and a secondary menu for reset/download/editor options. Put **Run** and **Submit** together above the editor. Default Run input mode to Samples; the adjacent selector switches to Custom input and reveals an input field. Preserve custom input on mode switches. `Ctrl/⌘+Enter` runs the selected mode; grading remains an explicit Submit action. Explain grading in a short focusable tooltip if needed. Do not silently replace public sample execution with custom execution.

**Results.** Start with a compact “Output appears here” empty panel. Show queued, running, success, wrong answer, syntax/runtime error, timeout, and infrastructure failure as separate states. For sample failures, show Input, Expected, Actual with a readable difference; collapse passed cases. For custom runs, show stdout/stderr and exit status without inventing expected output. For submissions, show grading status and a Continue action only on accepted completion. Keep hidden test contents private. Put job IDs, durations, and diagnostics in secondary details. Distinguish “Code needs a change” from “We couldn't run this; retry.”

**Draft safety.** Keep editor focus, selection, undo history, code, and custom input when updating results. Use `Saving…`, `Saved`, or `Saved on this device` accurately. Preserve the existing conflict-resolution and offline behavior. A report dialog, Attempts view, or quick task jump must not lose unacknowledged edits.

## Page-by-page work

Priority **P0** is the shared learning structure and workspace; **P1** completes core learner/author/admin flows; **P2** is secondary polish. Page IDs follow `packages/web/src/router/routes.ts`; shared IDs and aliases are listed explicitly.

### Learner and account settings — visually reviewed

| Page / route | Priority and concrete change | Completion criterion |
|---|---|---|
| P09 `/learn` | P1. Resume card with course, next lesson/task, completion, and one Resume button. Recent courses only if real data exists. | One click returns to the correct incomplete task; no repeated introduction. |
| P10 `/learn/courses` | P1. Consistent course rows, progress, next task, status tabs/counts, and Resume. Move version into secondary detail. | Filters retain state; completed course opens review rather than a misleading resume target. |
| P11 `/learn/:enrollmentId` | P0. Compact expandable syllabus using the same module/lesson model as the workspace; one Resume action. | Selecting any lesson goes directly to its task strip; completion matches the sidebar. |
| P12 theory step | P0 shell / P1 body. Persistent sidebar/strip, reading width around 65–75 characters, reusable code blocks, one content-end completion action. | Read → continue updates progress according to existing completion policy and preserves navigation context. |
| P13 video step | P0 shell / P1 body. Stable player area, collapsible transcript, retry/fallback for unavailable media. | Failed media does not leave an unexplained blank embed; transcript and allowed continuation remain usable. |
| P14 quiz step | P0 shell / P1 body. Align with reading page; large clickable options; Check answer next to the question; inline explanation. | Selection survives validation; correct/incorrect and multi-select states are clear without color alone. |
| P15 Python workspace | P0. Implement the workspace specification above; retain the problem/code split. | Run, inspect, edit, submit, continue can occur without losing context or editor state. |
| P16 attempts list | P1. Open as an in-workspace panel while preserving its deep-link route. Compact list of date, verdict, and mode where relevant. | Closing returns to the same code/cursor; empty state is one sentence. |
| P16 attempt detail `/attempts/:attemptId` | P1; not visually captured. Code and verdict details; Compare/Restore secondary actions. | Restore confirms replacement of an existing draft and respects revision conflicts. |
| P17 profile | P2. Single compact form; shorten “Identity” helper; show email status without pilot/internal wording. | Validation and save result are adjacent to the form. |
| P18 appearance | P2. Keep useful visual theme cards and editor preferences; remove captions that repeat labels. | Theme applies to shell/editor/dialogs; preferences persist; no extra Save action for autosaved fields. |
| P19 security | P2. Password section and one session action; short, accurate consequence text. | Errors preserve safe form state; auth/session effects remain explicit. |
| P20 privacy | P2. Export and deletion cards with status and next action; collapse detailed retention copy behind its policy link. | Request state is accurate; destructive consequences remain visible; unsupported cancellation is never offered. |
| Exercise report dialog | P1. Open over the current exercise with human-readable context; attach identifiers automatically. | Close returns focus to the triggering link; draft stays intact; code inclusion remains opt-in. |

### Author — detailed screenshot-based plan

See [Author interface plan](2026-10-06-author-interface-plan.md) for all course-management, editor, preview, publishing, roster, analytics, settings, connection, and recovery pages. Prioritize the persistent course tree, Save/Preview/Publish hierarchy, and preview parity. Keep existing Python tabs and publishing Edit links; improve their integration. Uncaptured student-detail and connection-setup entries remain proposals.

### Admin — detailed screenshot-based plan

See [Admin interface plan](2026-10-06-admin-interface-plan.md) for overview, users, courses, categories, reports, media, execution, and audit pages. Prioritize focused user/course action dialogs and accurate distinctions between admission state, worker health, job completion, and verdict. Existing tables and sidebar provide a useful base. Report and audit detail remain uncaptured proposals.

### Public and shared — detailed screenshot-based plan

See [Public interface plan](2026-10-06-public-interface-plan.md) for landing, catalog, course overview, account flows, Help, policy notices, and error pages. Prioritize a shared public shell, clearer product presentation, and the bare access-denied page. Preserve the already compact sign-in/sign-up forms. Reset-password and invitation states remain uncaptured proposals.

## Copy to remove or shorten

This is a UI copy pass, not a rewrite of authored course content. Every helper sentence must change a decision, explain a consequence, or resolve an ambiguity. Keep essential constraints, error recovery, opt-in choices, and destructive-action consequences.

| Current example | Change |
|---|---|
| “Step 4 of 7” repeated in heading and footer | Replace with the shared task strip; retain a single scoped position label if useful. |
| “Report an issue with this exercise” | “Report issue,” in the same secondary location on every step. |
| “Contextual course identifier.” and editable Course ID in report form | Remove from normal form; display course/lesson title and attach identifiers automatically. |
| “Run samples” + “Run code” + “Submit solution” | “Run” with visible input mode, plus “Submit.” |
| Raw `job-…` beside queued message | Put under Details; default status “Queued…” then “Running…”. |
| “0 total attempts…” plus “No attempts recorded yet…” | One empty state: “No submissions yet.” + “Return to task.” |
| “Manage how you are identified on rosters, submissions, and course discussions.” | Remove; “Display name” and a short visibility hint are sufficient if needed. |
| “Email addresses cannot be changed directly in the pilot…” | “To change your email, contact support.” |
| “Consistent dark surface” / “Consistent light surface” | Remove; theme name and preview communicate the choice. |
| “Fixed-width code font scaling” / “Python indentation depth” | Remove; “Font size” and “Indentation” labels are sufficient. |
| “Manage platform accounts, role capabilities, and audited support sessions.” | Remove from the users list header; controls and columns explain its purpose. |
| “Authoritative immutable log of administrative mutations and agent interactions.” | Remove from the audit header; explain details only in help if needed. |
| “Authorized asset quarantine and safe inspection. Raw binaries are never displayed directly.” | Replace header with “Media”; preserve relevant restrictions beside the action they affect. |

Do not remove runtime error explanations, input/output requirements, test visibility labels, privacy effects, or actual pending/error states merely to achieve a text-count target. Do not replace every label with an icon.

## Implementation order and source boundaries

1. **Shared learning structure.** Extend `components/shells/LearningWorkspaceShell.ts` and the course-tree model; add a dedicated horizontal task-strip component. The existing `LessonRail.ts` renders a vertical list, so avoid globally changing its meaning wherever it is reused. Update `styles/shells.css`, `styles/components.css`, and existing tokens as needed. Deliver persistent sidebar, task squares, correct completion state, and consistent reading/coding navigation first.
2. **Coding workspace.** Update `pages/learning/PythonWorkspacePage.ts`, `codemirror-editor.ts`, and relevant handlers in `main.ts`. Move Run/Submit, introduce explicit input mode, keep split/resize state, improve result presentation. Preserve `DraftSaveQueue`, local draft recovery, polling ownership, graded-submission semantics, and revision handling.
3. **Remaining learner flow.** Align theory/video/quiz/attempt pages and dashboard/course overview with the new shell. Implement contextual reporting with the shared Dialog component. Apply the concrete settings copy reductions.
4. **Author flow.** Consolidate toolbar, form, tree, save-state, and validation patterns in `AuthorWorkspaceShell.ts` and `pages/author/`. Reuse learner components for preview. Verify existing publish/reference-test/hint fixes before touching those behaviors.
5. **Admin and public refinement.** Apply shared table/filter/dialog patterns in `AdminPages.ts` and `AdminShell.ts`; then catalog/account/help and remaining settings. Keep any working focused confirmation rather than rebuilding it.
6. **Consistency pass.** Remove duplicated CSS/page-specific spacing overrides as pages migrate; keep changes scoped to avoid accidental cross-role regressions. Check both light/dark themes, long titles, empty/loading/error states, keyboard access, and reduced motion.

The current application frequently replaces `appEl.innerHTML` during route changes. Introduce a focused learning-shell update boundary rather than attempting a framework migration. Hoist tree/selection state and keep the editor instance stable during local output/tab updates. Use shared presentational components for buttons, badges, table filters, dialogs, and status messages; a design refresh does not require rewriting the backend.

## Verification and acceptance

Use current functional tests where available and add focused behavioral coverage for changed navigation/save/execution semantics. Avoid brittle tests that merely assert the new CSS class names or repeat implementation markup.

- At 1440×900, the module sidebar, task strip, task title, editor, Run, and Submit are visible together. No viewport-level horizontal scrollbar. At a narrower desktop width such as 1280×800, editor/problem minimum widths remain usable through sidebar collapse. Screenshots remain desktop-only.
- Clicking a lesson or task changes content without losing the selected lesson, sidebar scroll, collapsed modules, split ratio, or pending draft. Back/forward and direct links show the correct task.
- A completed selected square shows both completion and selection. Run success never marks a graded exercise completed; accepted Submit does, after server acknowledgement. All surfaces show matching course progress.
- Run sample success/failure, custom stdin/stdout, wrong answer, syntax error, runtime error, timeout, and infrastructure failure each produce appropriate output. No hidden test inputs or raw backend identifiers leak into normal feedback.
- Slow save, offline save, revision conflict, rapid task switching, and stale run responses preserve the learner's code. Switching results/input/attempt views does not reset editor undo history or selection.
- Theory/video/quiz navigation has a stable layout. An unavailable video offers meaningful fallback. The report dialog keeps the workspace context and restores focus on close.
- Author save/reload preserves all fields and hints; validation links land on exact fields; reference execution displays actual results; publish receipt corresponds to the server's published version.
- Admin action confirmation identifies the selected target and effect, preserves necessary inputs on recoverable failure, and reflects the resulting state/audit entry. Existing authorization and reauthentication rules continue to apply.
- Keyboard users can operate sidebar, squares, split controls, mode selector, Run/Submit, tabs, and dialogs. Visible focus, semantic labels, status announcements, and reduced-motion behavior work in both themes.
- Use DevTools timing to assess navigation and editor responsiveness on a fixed local fixture. A useful target is visible local interaction feedback within 100ms; do not hide network latency behind a forced animation or claim a measured improvement without a baseline.
- After implementation, capture corresponding desktop before/after states grouped by role. The follow-up request expanded review to author, admin, and public/shared; review each group separately and label uncaptured or untested states honestly.

The highest-value first delivery is the P0 learning shell and Python workspace together. Its acceptance is a complete learner flow: resume → choose lesson/task → edit → run → inspect → submit → see the square turn green → continue, without losing orientation or code.

## Learner refinement status — 2026-10-06

- [x] Review learner screenshots only and preserve the task squares and split workspace.
- [x] Add task type icons with separate completion badges and visible ordinals.
- [x] Repair latest navigation import regression and arrow transitions.
- [x] Save and inspect desktop captures; six browser workflows and 294 web tests passed.
- [x] Save [before/after comparison](2026-10-06-redesign-implementation/learner-refinements.html).

Other outstanding items retain their previous status.

## User screenshot corrections — minimal learner workspace

- [x] Consolidate navigation and Python execution controls into one top strip.
- [x] Remove breadcrumbs, task count, filename/runtime labels, overflow and footer chrome.
- [x] Direct ungraded Run with plain output; retain distinct sample tests and submission.
- [x] Quiz Next gating, selection state and authoritative completion updates.
- [x] Code syntax colors, contrasting caret, no active-line highlighting, Ctrl+Plus/Minus.
- [x] Hide routine autosave status; retain real saving and failure/conflict feedback.
- [x] Pin main account menu during content scrolling; verify desktop screenshots and browser behavior.

[Current comparison](2026-10-06-redesign-implementation/learner-minimal-comparison.html); 295 web tests and production build pass.
