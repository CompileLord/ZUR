# Author interface plan

## Implementation status

Status: **Core changes implemented and locally audited — full specification partially complete** (2026-10-06). Executor: agy `gemini-3.8-flash-high`, author scope. Track page-level completion, checks, and screenshot evidence in [implementation report](2026-10-06-redesign-implementation/author/REPORT.md). Independent review, completed checks and remaining requirements are recorded in [Codex audit](2026-10-06-redesign-implementation/AUDIT.md). Agent self-check alone does not mark the plan complete.

This extends the [shared redesign plan](2026-10-06-interface-redesign-plan.md) after reviewing all 13 saved author desktop screenshots. These findings replace the earlier author proposals where they differ. This is a planning deliverable; no application implementation is included.

Evidence: [author screenshots](2026-10-06-desktop-design-review/INDEX.md#author). Screenshot numbers below refer to this group. Student detail and connection setup were not captured, so their entries remain proposals. Screenshots establish visible layout and displayed state, not save correctness, speed, or successful publication.

## Direction and priorities

Make the course builder and step editors one continuous workspace. The course tree currently appears in the builder (02) but disappears inside the theory, video, quiz, and Python editors (03–06). Different editor widths and repeated “Back to Course Builder” links make each step feel separate. Student preview (07) then uses a different presentation again, including a duplicated title and plain code rendering.

**P0:** persistent editing context, a clear Save/Preview/Publish hierarchy, and learner-accurate preview. **P1:** publishing validation and the four editor types. **P2:** roster, analytics, settings, connections, and activity refinement. Reuse the master plan's typography, semantic colors, spacing, and motion rules.

At 1440px desktop width, start with a 56px course header, 44px course navigation, a 264px course tree, and the remaining width for the editor. Move infrequently used step settings into a collapsible inspector; when open, give it about 256px. Allow authors to collapse the tree or inspector for code-heavy work. Prefer one content scroll region and an independently scrolling tree to several nested scroll areas.

```text
Course / Module / Lesson                    Saved   Save   Preview   Publish…
Content    Students    Analytics    Settings
┌ Course structure ─────┬ Selected step / editor tabs ──────┬ Settings ▾ ┐
│ Module → Lesson       │ Title                            │ Duration   │
│  Theory               │ Content                          │ Required   │
│  Video                │                                  │            │
│  Quiz                 │                                  │            │
│  Python               │                                  │            │
└───────────────────────┴──────────────────────────────────┴────────────┘
```

Save is primary while a step has unsaved changes. Preview stays secondary and Publish opens the release review. On the release page, Publish becomes the primary action when validation permits it. Move Recent changes into a secondary course menu. Never show a prominent enabled Save next to “Saved” without a meaningful dirty state. Saving status reflects server acknowledgement; the screenshot alone does not prove the current label is incorrect.

## Page changes

| Page and evidence | Observed issue / retain | Planned change and acceptance |
|---|---|---|
| **P21 Your courses — 01** | Course status, search, tabs, and New course already form a useful layout. Subtitle repeats the page purpose; course cards have generous height. | Keep the layout and Learn/Teach switch. Remove the introductory subtitle. Use tighter course rows with title, publication state, students, updated time, and Open. Make “Unpublished changes” a concise secondary status. Return from a course restores filters and scroll. No decorative statistics to fill empty space. |
| **P22 Course builder — 02** | Structure is repeated in the left tree, center counts/module list, and right overview. Step titles truncate early; `4/20` lesson counts look like completion without context. | Keep the tree as the single navigation hierarchy. Use the center for the selected course/module/lesson's editable content and contextual Add actions. Remove the duplicate summary inspector. Label capacity as “4 steps”; show the maximum near Add only when useful. Permit readable wrapping or accessible title disclosure. Reorder controls retain keyboard operation. Selection and expanded nodes persist across editor navigation. |
| **P23 Theory editor — 03** | The course tree is absent. A sparse settings pane consumes width. The toolbar, Edit/Preview tabs, and Markdown help compete for space. | Retain the tree and title context. Keep useful formatting controls; show labels on focus/hover. Use Edit/Preview and an optional split at sufficient width. Put asset insertion beside the image tool; collapse metadata settings. Replace permanent Markdown capability text with a help link. Preview uses the learner's Markdown renderer and code blocks. |
| **P23 Video editor — 04** | A URL is populated while the preview still asks the author to enter a URL. Preview action appears in both header and inspector. Long provider/privacy/accessibility text dominates. | Show distinct empty, loading, playable, unsupported-URL, and unavailable-embed states based on actual validation. Label the field “Video URL”; provide short supported-provider help. Keep one Preview action. Group transcript/caption controls together with a concise explanation when needed. Do not imply that checking “captions verified” proves playback works. Save/preview must retain the entered URL and transcript. |
| **P24 Quiz editor — 05** | Single/multiple-choice control already exists. “Correct answer” repeats on every row, and the explanation is pushed below a tall option list. | Keep the choice-type control. Use a short “Select the correct answer” instruction above compact option rows; each radio/checkbox retains an accessible option-specific label. Put explanation directly after options, with Add option nearby. Keep drag handles only with equivalent keyboard movement. Changing quiz type must surface incompatible selections without silently losing answers. |
| **P25 Python editor — 06** | Problem/Code/Tests/Validation tabs already exist; large short-content textareas create a long form. Technical limits dominate the inspector. Hints sit far below the statement. | Retain the existing tab model. Use content-sized input/output fields, an expandable statement editor, and a clear Hints section link/tab. Show test counts as “1 public · 1 hidden.” Put limits in advanced settings. Use the same code-editor styling as the learner workspace. Reference execution belongs beside tests/validation, with per-test results. Switching tabs must preserve all dirty fields, hints, code, and scroll. Code/Tests/Validation tab contents were not captured and require implementation-time verification. |
| **P26 Student preview — 07** | Theory title is duplicated, code presentation differs from the learner page, and the usual course navigation is absent. | Render the actual learner shell and step components with a compact Preview banner and Return to editor. Preserve authored headings; solve duplicate presentation through a consistent title/rendering contract rather than silently stripping content. Include the same task squares, sidebar, code blocks, and split workspace. Preview actions use isolated preview state and never change student progress. Return selects the exact edited step. |
| **P27 Publish review — 08** | Seven near-identical `INTERNAL_ERROR` rows, no visible exercise names, repeated blocker instructions, and a Publish navigation button on the publish page. Edit step links already exist. | Group issues by named exercise and distinguish a failed reference assertion from an execution-service failure. A service failure should offer Retry validation and diagnostic details, while publishing remains blocked until checks succeed. Show one summary, e.g. “3 exercises need review,” with detailed counts underneath. Preserve and improve existing Edit links to open the exact tab/field/test. Hide the redundant header link to the current page. Keep release effects and actual version in the final receipt. |
| **P28 Students and invitations — 09** | Tabs, filters, progress bars, and row actions already exist. The long title and full-width search dominate; inactive pagination appears for four rows. | Title the page “Students”; retain Enrolled/Invitations tabs. Balance search and version/access filters on one toolbar. Link the student name to detail; move secondary actions into its menu. Keep progress counts and version context. Hide pagination controls when there is one page while retaining the count. Returning from detail restores filter state. Apply the same behavior to `/roster`. |
| **P29 Student detail — not captured** | Prior proposal only. | Use a student summary, course/version/progress, module list, and selected attempt panel. Put revoke/reinstate in a focused action dialog. Maintain roster return state and never mix attempts from different students. Verify against a real populated state before deciding what to remove. |
| **P30 Analytics — 10** | The methodology accordion already exists. Metric descriptions are lengthy. Global “All versions” coexists with “Version 2 (latest release)” exercise data; this may be intentional but needs explicit scope. | Remove the claim about “authoritative records.” Shorten metric descriptions and move definitions into the existing methodology panel. Label overview scope separately from exercise scope or align their selectors where supported. Keep server-defined metric meaning intact. Use compact table rows and a single empty-data explanation. Investigate rows showing zero participants alongside an activity timestamp before naming a defect. |
| **P31 Course settings — 11** | Wide inputs, repeated section descriptions, and a long page make secondary settings hard to reach. | Use a shared form width around 760–880px with section jump links for Basics, Catalog, Enrollment, Versions, Lifecycle. Keep course description/outcomes/prerequisites as authored content. Remove descriptions that only repeat field labels. Preserve one clear save mechanism and accurately distinguish draft metadata from published data. Below-fold content was not visually reviewed. |
| **P43 AI connections — 12** | Useful status tabs and an access summary already exist. “Never used” appears twice; a raw identifier occupies a second title line. Settings navigation and teaching navigation both surround the page. | Keep this under account settings with a Teach shortcut pointing to the same route. Put token ID in details/copy controls. Show lifecycle state and last-used time as separate concepts, without repeating the same text. Keep course scope visible. “New connection” starts a flow that reviews scope before creating the one-time token. Retain the collapsed explanation. |
| **P44 Connection setup — not captured** | Prior proposal only. | Client selection → setup instructions → copy → verify. Keep secret reveal/copy inside the appropriate one-time state, with concise confirmation. Verification should identify the next corrective action and preserve selected client. Inspect the current setup before redesigning its details. |
| **P45 Agent activity — 13** | “Mutations” and “recoverable draft snapshots” are technical; four filters dominate an empty page; back navigation repeats. | Title “Recent changes” to match the entry point. Default to a concise empty state; show filters when activity exists or a filter is active. When populated, use actor, action, target, time, and outcome rows with expandable diffs. A single Return action is enough. Restore opens a preview of the affected content and respects revision conflicts. |

## Copy and interaction details

| Current copy | Replacement / placement |
|---|---|
| “Course overview and structure management.” | Remove. |
| “Back to Course Builder” in every step | Persistent tree and breadcrumbs make it unnecessary; retain a compact back route when the tree is collapsed. |
| “Published (Unpublished changes)” | “Published” badge plus “Draft changes” status. |
| “Approved video URL” | “Video URL”; validation explains actual supported formats. |
| “Ensures WCAG 2.2 AA accessibility and provides an alternative text stream…” | “Add a transcript for learners who cannot play the video.” Do not promise conformance from one field. |
| “Reference solution failed test case #1: INTERNAL_ERROR” | “Validation couldn't run” plus named exercise/test and diagnostic Details, only when classified as an infrastructure failure. |
| “Exact learning activity and completion metrics computed strictly from authoritative records.” | Remove; keep definitions in Methodology. |
| “Inspect AI mutations…” | “Changes made by connected tools.” |

Keep course tree and top navigation mounted while editing changes. Save dirty forms before a deliberate context switch using the existing persistence contract; if a save fails, keep recoverable inputs and offer Retry/Stay. Preserve draft state when previewing. Animate the changing editor area or opening inspector for 140–180ms; never fade the entire workspace or delay typing. Respect reduced motion.

## Delivery and verification

1. Update `AuthorWorkspaceShell.ts` and shared course-tree components to preserve navigation across all editor routes; consolidate toolbar states and inspector placement.
2. Reuse learner renderers in `AuthorPreviewPage.ts`; verify theory, video, quiz, and Python preview parity.
3. Refine `TheoryEditorPage.ts`, `VideoEditorPage.ts`, `QuizEditorPage.ts`, and `PythonExerciseEditorPage.ts`; keep useful existing tabs and controls.
4. Refine `CoursePublishPage.ts` and its existing validation data flow. Do not invent service-retry behavior unsupported by the API; extend it explicitly if needed.
5. Apply the smaller list/form/copy changes to author management and connection pages.

Acceptance journey: open course → select lesson/step → edit → save → preview the same step → return → validate → inspect/fix named issue → publish → see actual receipt. Test save failures, rapid step switches, unsaved previews, reference-run service failures, and long titles. Check keyboard tree navigation, reorder controls, dialogs, both themes, and reduced motion. Capture the changed states at desktop resolution; verify layout without publishing real courses solely for screenshots.

## Independent audit status — final correction pass

- [x] Four editor save/error/retry flows persisted to ephemeral SQLite.
- [x] Dirty preview navigation saves first, stays on failure and targets the exact edited step.
- [x] Publication issue grouping, all Edit-tests destinations and retry verified.
- [x] Controlled validation receipt integration creates the next release and shows its actual version.
- [x] Preview copy success/failure, sidebar/arrows, Python split width and unchanged learner records verified.
- [x] Real student revoke/reinstate persistence verified in the test database.
- [x] Desktop screenshots saved and independently inspected; corrected core accepted.
- [ ] Complete original requirements for retained shell, inspector collapse, full accessibility, media failure states, invitation/connection lifecycle, filters/scroll restoration and activity restore.

See [independent acceptance audit](2026-10-06-redesign-implementation/author/INDEPENDENT-AUDIT.md) and [desktop comparison](2026-10-06-redesign-implementation/author-audit-comparison.html).
