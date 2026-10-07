# Author coverage inventory

35 fresh PNGs captured and verified; routes, timestamps, state, viewport, and theme are listed individually in [author-manifest.json](author-manifest.json), interactions in [author-interaction-log.json](checked-interaction-log.json). Capture fixture: disposable seeded SQLite (`zur-author.sqlite`), temporary uploaded media asset, separate dynamic API and Vite ports, and dedicated Chrome profile. Viewports: standard 1440×900, plus two desktop-width full-page captures (1440×1552) for long connection setup documentation. No terminal summaries, synthetic browser error pages, or captures of failed page loads are counted.

“Reviewed” below means the described presentation/state only. Every unlisted relevant state/theme is **unverified**, not a whole-page pass. The author change candidates are detailed in [author-plan.md](author-plan.md).

| Page / route | Reviewed state / theme | Result | Evidence filename prefix |
|---|---|---|---|
| P21 `/teach` | Author dashboard; dark/light 1440×900 | Reviewed presentation; duplicate `<main>` landmark | `author-p21-dashboard-*` |
| P22 `/teach/:courseId/content` | Course builder tree & inspector; dark/light 1440×900 | Reviewed tree layout and module/step structure | `author-p22-builder-tree-*` |
| P23 `.../content/theory/:stepId` | Theory editor; dark/light normal; dark dirty 1440×900 | Markdown editor and unsaved change indicator reviewed | `author-p23-editor-theory-*` |
| P23 `.../content/video/:stepId` | Video editor; dark/light 1440×900 | Video URL, provider, transcript inputs reviewed | `author-p23-editor-video-*` |
| P24 `.../content/quiz/:stepId` | Quiz editor; dark/light 1440×900 | Question prompt, options, answer key selection reviewed | `author-p24-editor-quiz-*` |
| P25 `.../content/python/:stepId` | Python exercise editor; dark/light normal; tests tab 1440×900 | Problem statement, starter code, test case tab deep link reviewed | `author-p25-editor-python-*` |
| P26 `/teach/:courseId/preview` | Student preview outline; dark/light 1440×900 | Preview warning banner, curriculum outline reviewed | `author-p26-student-preview-*` |
| P26 `.../preview?stepId=:stepId` | Student preview Python exercise; dark 1440×900 | Disabled sample/submit controls, return to editor CTA | `author-p26-student-preview-python-*` |
| P27 `/teach/:courseId/publish` | Publication review checklist; dark/light 1440×900 | Blockers, warnings, release checklist reviewed | `author-p27-publish-review-*` |
| P28 `/teach/:courseId/students` | Students roster & invite tokens; dark/light 1440×900 | Learner roster table, invite generation reviewed | `author-p28-students-roster-*` |
| P29 `.../students/:enrollmentId` | Student detail & progress; dark/light 1440×900 | Ada Lovelace step breakdown, waiver status reviewed | `author-p29-student-detail-*` |
| P30 `/teach/:courseId/analytics` | Course analytics dashboard; dark/light 1440×900 | Enrollment metrics, exercise drop-off metrics reviewed | `author-p30-course-analytics-*` |
| P31 `/teach/:courseId/settings` | Course settings form; dark/light 1440×900 | Title, slug, difficulty, category, archive form reviewed | `author-p31-course-settings-*` |
| P43 `/settings/ai-connections` | AI connections list; dark/light 1440×900 | Token list, scopes, generate token modal trigger reviewed | `author-p43-ai-connections-*` |
| P44 `.../ai-connections/:id/setup` | Setup guide; dark/light 1440×900 & full-page 1440×1552 | SDK TypeScript configuration, endpoint and waiting status reviewed | `author-p44-connection-setup-*` |
| P45 `/teach/:courseId/activity` | Agent activity & draft diffs; dark/light 1440×900 | Seeded mutation timeline and View diff trigger reviewed; diff viewer unverified | `author-p45-agent-activity-*` |

## Explicit unavailable/unverified state inventory

- P21 `/teach`:
  - New course creation modal: open, validation error, service failure (title retention check in live log confirmed title reset), create success transition; both themes.
  - Search and status filter combination: query persistence on status click (live check confirmed search parameter drop).
  - Empty course state (zero courses authored); both themes.
  - Loading skeleton and API 500 error recovery states; both themes.
- P22 `/teach/:courseId/content`:
  - Add module, add lesson, add step dialogs and validation errors.
  - Drag-and-drop / reordering interaction states and keyboard reorder accessibility.
  - Delete step / module confirmation modal and undo banner.
  - Large course syllabus with >50 steps and nested scroll persistence.
- P23 Theory / Video Editor:
  - Save in-progress spinner and save failure error toast/banner.
  - Real asset upload drag-and-drop file picker interaction.
  - Video preview player active playback and invalid URL error state.
  - Browser Back/Forward navigation while dirty (unsaved markdown).
- P24 Quiz Editor:
  - Add option / remove option interactions; minimum option validation error.
  - Multi-select vs single-select mode toggling.
  - Markdown preview tab for question prompt and explanations.
- P25 Python Exercise Editor:
  - Solution tab, starter code tab, hints tab; dark and light.
  - Add/delete test case interaction and hidden test toggle.
  - Live execution test runner in author mode (unverified; execution mock/sandbox isolation).
  - Validation errors on empty starter code or missing assert statement.
- P26 Student Preview:
  - Light theme Python exercise preview layout.
  - Video and quiz preview rendering across course outline; theory is captured.
- P27 Review Publication:
  - Course publish confirmation modal and published release state transition (publication is explicitly prohibited in this review; seeded published state only).
  - Production validity of the captured zero-blocker seeded checklist (rendered ready state is captured; real validation/execution is not established).
  - Network failure during release creation.
- P28 Students & Invitations:
  - Invite token modal open, token generation error, copy token clipboard interaction.
- P29 Student Detail:
  - Student with 0% progress (new enrollment).
- P30 Course Analytics:
  - Empty analytics state (course with 0 enrollments).
- P31 Course Settings:
  - Course archive confirmation dialog and delete course danger zone.
  - Slug collision validation error and save success feedback.
- P43 AI Connections:
  - Create token modal open, scope checkbox selection, token generated disclosure modal (with copy secret warning).
  - Revoke token confirmation dialog and revoked token state.
- P44 Connection Setup:
  - Copy JSON snippet button interaction and toast feedback.
  - Tool verification status indicator (live ping tool execution).
- P45 Agent Activity & Draft Recovery:
  - Restore draft confirmation dialog and diff conflict resolution.
  - Empty activity timeline (course with no agent mutations).

## Reviewed author interactions & findings

1. **Duplicate Main Landmark on Author Dashboard (P21)**:
   - DOM inspection on `/teach` revealed `mainCount: 2` and `mainIdCount: 2`. The page body renders an outer `<main id="main-content">` from the application shell and an inner nested `<main id="main-content">` inside `AuthorCoursesPage`. This is a confirmed accessibility landmark defect.
2. **Author Dashboard Search Dropped on Status Filter (P21)**:
   - Clicking status tabs (e.g. Draft / Published) sets `?status=...` but clears the existing `?search=...` query parameter from the URL, dropping user search context.
3. **Course Builder Tree Navigation (P22 -> P23/P25)**:
   - Clicking curriculum step items successfully transitions to the specialized editor with preserved context and title.
4. **Theory Editor Dirty State (P23)**:
   - Typing into the Markdown textarea immediately activates the dirty state indicator and enables the Save button (`author-p23-editor-theory-dark-dirty.png`).
5. **Python Editor Deep-Link Sub-tab Navigation (P25)**:
   - Direct navigation to `/teach/:courseId/content/python/:stepId?tab=tests` properly selects the Test Cases sub-tab and renders the test input/output rows (`author-p25-editor-python-dark-tab-tests.png`).
6. **Student Preview Execution Guard (P26)**:
   - In preview mode (`/teach/:courseId/preview?stepId=...`), the student workspace correctly indicates preview status, displays the Back to Editor exit link, and disables runtime submission controls (`Run samples`, `Submit solution`) to prevent non-destructive test tampering.

## Independent review corrections

The table records visible presentation only. It does not certify accessibility, invite generation, analytics correctness or successful navigation merely because a control is visible. The raw six-item interaction log primarily checks rendering; a full authoring journey remains unverified. Independent controlled checks confirm title loss, query loss, duplicate landmarks and shell loss after list failure. Screen-reader behavior and failure-state screenshots remain gaps. No course was published. The final reviewed plan supersedes the provisional plan; no WCAG conformance claim is made.

The complete route/state inventory is authoritative for captured variants; visible controls do not establish completed mutations.

All 35 PNGs rechecked on 2026-10-08 against the prompt principles. Clean Saved headers/repeated publication copy require A6 (judgment); internal PRD wording/repeated setup detail require A7 (judgment). Setup is a TypeScript SDK example; screenshots do not show Claude/Cursor JSON configuration. Horizontal builder-tree scroll, live clipboard/handshake, diff opening and narrower author layouts remain unverified. Time-range controls are visible on Analytics; changing them is unverified.
