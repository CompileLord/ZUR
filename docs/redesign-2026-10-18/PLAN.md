# ZUR redesign plan — 2026-10-18

Based on 45 desktop screenshots (1440×900) in `screenshots/redesign-2026-10-18/{learner,author,admin,public}`.
Status: PLAN ONLY, no product code changed. All four capture agents finished; every screenshot set has been viewed (settings added 2026-10-18).

## 1. What is wrong today (seen in the screenshots)

1. **Flat hierarchy.** Every section is the same bordered dark card; nothing is primary. Admin overview has six equal tiles, two of them empty ("Unavailable", "No telemetry").
2. **Empty canvas.** Dashboard, My courses, Catalog, Attempts, Reports, Media, Audit show one row on a huge blank page. Content hugs the left, gutters differ (264 vs 312 px).
3. **Too much text, too little signal.** Captions under every number (analytics), explanatory paragraphs, "Methodology" accordions, ID strings, mono-spaced counts ("1/4 completed", "0/2").
4. **Double navigation.** Learner workspace: sidebar + step squares + top bar. Author: top tabs + sidebar tree + breadcrumbs + step settings column. Truncated sidebar titles with a horizontal scrollbar.
5. **Hidden actions.** Kebab menus (students, My courses), `…` buttons that open dialogs (admin), tiny drag handles/radios (quiz editor).
6. **Raw forms.** Long stacks of identical textareas (Python exercise Problem tab, Course settings, Report triage), native date inputs, default checkboxes.
7. **Authoring is Markdown-in-a-textarea** with no live preview; video editor's black player pushes the transcript off-screen.
8. **Learner workspace**: output pane empty/squeezed, task panel has dead space, "Report issue" misaligned with primary button, quiz shows literal backticks around `n`, Attempts page keeps irrelevant module sidebar.
9. **Editor colors do not look like VS Code**: only 7 token rules; no purple control-flow keywords, no teal types/classes, no builtin/decorator/operator colors; default text `#e2e7d9` (greenish) instead of `#d4d4d4`; editor background, gutter and selection come from app tokens.

## 1b. Code analysis: how pages and redirects work today

Files read: `packages/web/src/main.ts` (6,097 lines), `router/routes.ts`, `pages/learning/*`, `PythonWorkspacePage.ts`, `codemirror-editor.ts`, `styles/tokens.css`.

**How it works.** `routes.ts` holds a list of regex routes (P01–P45), each tagged with a shell (S1 public, S2 auth, S3 app, S4 learning, S5 author, S6 admin). `navigateTo()` calls `history.pushState` then `renderApp()`. `renderApp()` matches the route, applies auth guards, then a big `switch(route.shell)` in `main.ts` builds HTML strings and assigns `appEl.innerHTML`. Data pages first render a loading state and then replace the whole page again when the fetch resolves. Unauthenticated access to protected routes redirects to `/sign-in?returnTo=…` (safe, internal paths only). Dirty-state guards exist for author, profile and appearance pages.

**What hurts the user's feeling (verified in code):**

| # | Finding | Where | Effect on the user |
|---|---|---|---|
| C1 | Every navigation replaces the entire DOM, including the sidebar/shell | `renderApp`, 131 `innerHTML` writes in `main.ts` | Sidebar and top bar flash on every click; scroll, focus and hover state are lost |
| C2 | Loading screen for learner pages is a bare `<h1>` + "Loading from your account…" with no shell | `showRouteLoading` (main.ts:1069) | Page goes blank, then pops in; feels slow even when fast. A skeleton component already exists (`UniversalStates.ts`) but is unused here |
| C3 | "Mark complete and continue" does a **full page reload** | `window.location.assign(...)` main.ts:2146 | Flash and lost state at the most frequent moment of the learner journey |
| C4 | Retry buttons reload the browser page | `onclick="window.location.reload()"` main.ts:3627, 3763, `CoursePublishPage.ts:198` | Loses unsaved UI state; looks broken |
| C5 | Unsaved-change warnings use native `window.confirm` | main.ts:5994, 6007, 6048 | Ugly, unbranded, cannot explain "Save and leave" |
| C6 | After a passing Submit, nothing celebrates or advances: `nextStepUrl` is deliberately `null` and a small "Continue" appears in the toolbar later | `PythonWorkspacePage.ts:439, 471`, main.ts:2750 | No sense of progress at the key moment |
| C7 | Catalog renders twice (empty shell, then final) and the full page is rebuilt | main.ts:3203–3262 | Visible layout jump |
| C8 | One 6,097-line file holds routing, data loading, rendering and listeners; P12–P15 share one URL and are decided after a fetch | `main.ts`, `routes.ts:57–60` | Hard to change safely; any redesign risks regressions. Also a dead hard-coded demo step (main.ts:3508–3560) |
| C9 | Everyone defaults to `/learn` after sign-in (`getSafeReturnDestination` fallback) | `routes.ts:161` | Authors/admins land on the learner page first |
| C10 | Only ~51 transitions in 5 CSS files, no route transitions, no skeleton for tables/cards | `styles/*.css` | Static, abrupt feel |
| C11 | Syntax coloring uses 7 rules; defaults `--syntax-default: #e2e7d9`; editor font size only via Ctrl +/- (no UI, not remembered) | `codemirror-editor.ts:57–67`, `tokens.css:48–54` | Does not feel like VS Code |
| C12 | `Mod-Enter` is wired in the editor but there is no visible hint; no global shortcuts | `codemirror-editor.ts:70` | Users do not discover fast paths |

**Improvements derived from the findings (kept low-risk, no rewrite of the router):**

1. **Persistent shell, swappable content (fixes C1, C7).** Render the shell once per shell-type; on navigation replace only the `<main>` content. Keep sidebar scroll/hover. Add a small `mountContent(html)` helper and use it in `renderApp`.
2. **Skeletons inside the shell (fixes C2, C7).** Replace `showRouteLoading` with a shell + page-shaped skeleton (cards for lists, task+editor panes for workspace). Delay showing it by ~150 ms to avoid flashing on fast loads; keep the previous content visible until then.
3. **SPA completion flow (fixes C3, C6).** Replace `location.assign` with `navigateTo`. On pass: inline success banner "All tests passed" with a prominent **Next step →** button and Enter shortcut, plus a progress-ring tick animation (respect `prefers-reduced-motion`). On lesson finished: a short "Lesson complete" card with next lesson.
4. **Retry without reload (fixes C4).** `renderApp()` re-run with the same path.
5. **Branded leave-confirm dialog (fixes C5).** Reuse `Dialog.ts` with "Stay / Save and leave / Discard"; keep `beforeunload` for browser close only.
6. **Role-aware landing (fixes C9).** After sign-in without `returnTo`: author with courses → `/teach`, admin → `/admin`, else `/learn`; add a role switcher (Learn / Teach / Admin) in the shell header.
7. **Route polish (fixes C10).** 120 ms fade/slide on content swap, reset scroll to top, move focus to the page `<h1>` for accessibility, update `document.title` per route, animate progress bars.
8. **Editor (fixes C11, C12).** Extend HighlightStyle + tokens (table in §4), add font-size/reset/shortcut chips under the editor, persist font size, show `Ctrl+Enter` hint on the Run button.
9. **Maintainability guard (C8).** Do not rewrite `main.ts` now. Extract only what the redesign touches (`loadPythonWorkspace`, `loadEnrolledStep`, `loadLessonStep`, shell mounting) into `pages/learning/controllers/*.ts`, and delete the dead demo step. Each extraction is verified by the existing test suite before moving on.

## 1c. Settings, AI connections and help (added after the last capture batch)

Seen in `public/08–12c`, `05-help-*`:
- **Settings** (Profile, Appearance, Security, Privacy): a label column on the left and a 400px field column, leaving the right third empty. The Learn/Teach switcher and the sidebar items change between pages. The Appearance page is the strongest one: theme cards with live previews. Keep that pattern and reuse it for editor theme/font choices. Security's red outlined "Sign out of all devices" button and the cramped Privacy warning box need the shared Alert and danger-button styles.
- **AI connections:** a 7-column table with tiny monospace token IDs and a hidden `⋮` menu. The "Setup" button is the primary lime colour on every row, so nothing is primary. Plan: cards or a 4-column table (name, access, status, last used) with the actions inline.
- **MCP setup:** four uneven numbered cards in a 2×2 grid, a code block that scrolls horizontally and is clipped, and jargon (bearer, scopes, pinned versions). Plan: one vertical stepper with a single "Copy config" button, a plain-language summary ("Claude Desktop can edit your draft courses"), and a live "Waiting for first request" indicator.
- **Help:** long FAQ with many collapsed sections and low-contrast body text. The report dialog asks for a raw Course ID instead of a picker.
- **Unconfirmed: modal open on first load of /help.** The public agent reported the "Report an issue" dialog covering `/help` on a plain load. The code does not support that: the dialog has `display:none` inline and a `:not([open])` CSS rule, and `openReportModal` is only called from click handlers. The agent's own check (`querySelector("[role=dialog]")`) would be true even when hidden. It may be a leftover from a previous page state in the harness. Task P4.0 reproduces it in a clean browser before anyone "fixes" it.

## 2. Design direction

- **Calm, dense-where-needed, spacious-where-not.** Fewer words, more structure (icons, badges, progress rings, thumbnails).
- **Surfaces, not borders.** Replace "card with border everywhere" by 3 elevation levels (page / panel / raised) with soft 1px inner highlight; borders only for inputs and tables.
- **Palette.** Neutral blue-black dark (`#0d1117`-ish page, `#161b22` panel, `#1f2630` raised) and a warm off-white light theme. Keep ONE brand accent (current lime, slightly desaturated) for primary action + progress; semantic green/amber/red only for state. Remove the greenish tint from neutrals so code and text read cleanly.
- **Type.** Inter UI + JetBrains Mono for code; scale 12/14/16/20/28; drop uppercase micro-labels except in tables.
- **Shape.** 10px radius panels, 8px controls, 44px minimum control height; consistent 24px page gutter, max content width per page type (reading 720, forms 880, tables 1200).
- **One layout grid per shell** so gutters stop drifting.

## 3. Structure changes

### Learner
- **Dashboard becomes the home**: "Continue" hero (course thumbnail, next step, progress ring, big button) + streak/time-today strip + "Your courses" cards + recommended course. Merge "Continue" and "My courses" into **Home** (tabs In progress / Completed stay as a filter chip row). Sidebar: Home, Explore, Help.
- **Course page**: collapse modules (only current expanded), per-lesson progress ring, step-type icons with duration, sticky "Resume" button; remove "Course Syllabus" duplicate headings and mono counts.
- **Step pages (theory/video/quiz)**: single top bar (back, breadcrumb, progress segments); drop the permanent left tree into a slide-over "Outline" (⌘/Ctrl+B) so reading width is centered and calm. Primary + "Report issue" aligned in a footer bar; Previous/Next at the footer.
- **Python workspace (keep the split you like)**:
  - Left: task (statement, I/O as two small boxes, constraints as chips, hints as "Reveal hint 1/3" progressive button). Tabs: Task · Attempts · Notes.
  - Right: editor on top, **Output/Tests drawer** below that auto-expands on Run (resizable, remembers height). Results show per-test pass/fail chips first, details on click.
  - Top bar reduced to: step progress segments, **Run (Ctrl+Enter)**, **Submit**, overflow for "Test samples/Reset/Settings".
  - Left outline hidden by default (slide-over).
  - Editor toolbar: font size, reset code, theme, keyboard-shortcut hint, "unsaved/saved" indicator.
- Attempts becomes a drawer/tab inside the workspace instead of a separate page.

### Author
- **Course shell**: one header (back, title, status, Preview, Publish) + ONE navigation level: tabs Content · Students · Analytics · Settings; the tree lives only on Content.
- **Content tab**: wider tree (resizable, no horizontal scroll, full titles with tooltip), drag-and-drop reorder (remove arrow buttons), inline "+ Add step" per lesson with type picker (Theory / Video / Quiz / Python), step-type colored icons, validation dots on steps that block publish.
- **Editors**: split live preview (Markdown left, rendered right) with toolbar; side panel "Step settings" collapsible; autosave status chip. Video: URL + small preview, transcript beside it. Quiz: bigger answer cards, click-to-mark-correct, shuffle/explanation as accordion. Python: replace 4 tabs by a **stepper layout** — Problem (rich fields in 2 columns) / Starter & solution code (real code editor with same theme) / Tests (table with public/hidden toggle, "Run reference solution" button) / Review.
- **Settings**: split into sub-pages in a left rail (Basics, Catalog, Enrollment, Versions, Lifecycle) instead of one long scroll.
- **Publish**: a checklist panel (each item links to the problem step) + "What changes for students" summary + one primary button; drop the duplicated step trail.
- **Students**: card/table hybrid with avatar, progress bar, last-active relative time; row click opens detail; actions visible on hover; bulk invite via paste.
- **Analytics**: 4 KPI tiles w/o captions, a funnel/step drop-off chart, "hard exercises" list; hide empty rows; methodology becomes an info popover.

### Admin
- **Overview as triage**: top = "Needs attention" list (open reports, suspended courses, failing jobs), then one compact health strip (execution, queue, errors) with colored dots; hide unavailable telemetry behind "Not configured" chip.
- Tables get row hover, sticky headers, saved filters, relative times, and real empty states with an illustration + next step. Detail pages use a two-column layout: summary left, actions + timeline right (actions visible as buttons, danger separated). Media gets thumbnails/grid. Audit gets grouped-by-day timeline with human labels and expandable raw IDs. Execution: custom date-range popover; the "Pause new runs" control as a labeled switch with confirm.

### Public / account
- **Landing**: keep hero but fix hierarchy: smaller headline-to-body gap, real course preview cards, social proof placeholder, single CTA pair; collapse the three feature columns into icon cards; move teacher section to its own `/teach` page.
- **Catalog**: card grid with thumbnail/gradient, level, duration, lessons count; filters as chips + sort; search with `/` shortcut.
- **Course overview**: sticky enroll card, collapsible syllabus (all collapsed except first), "What you'll build" block.
- **Auth**: split layout (form + product visual), social login placeholder, inline password strength; move legal checkbox to concise line.
- **Help**: search-first FAQ with categories; "Report an issue" becomes a context-aware drawer (course picker instead of typing a course ID).
- **Not found/denied**: one shared friendly empty-state component with icon in the same position; fix the icon cramped under the header.
- **Settings**: single "Account" page with left rail (Profile, Appearance, Security, Privacy, AI connections); Save bar appears only when dirty.

## 4. VS Code–style editor (quick win, do first)

Replace the 7-rule HighlightStyle with a full Dark+/Light+ map (via `@lezer/highlight` tags):

| Token | Dark+ | Light+ |
|---|---|---|
| keyword (def, class, import, return) | `#569cd6` | `#0000ff` |
| control keyword (if, for, while, try, with, yield) | `#c586c0` | `#af00db` |
| string / f-string | `#ce9178` | `#a31515` |
| number | `#b5cea8` | `#098658` |
| function name / call | `#dcdcaa` | `#795e26` |
| class / type name | `#4ec9b0` | `#267f99` |
| variable / property | `#9cdcfe` | `#001080` |
| builtin (print, len, range), `self`, `None/True/False` | `#4fc1ff` / `#569cd6` | `#0070c1` / `#0000ff` |
| decorator | `#dcdcaa` | `#795e26` |
| comment | `#6a9955` italics | `#008000` |
| operator / punctuation | `#d4d4d4` | `#000000` |

Surface: background `#1e1e1e` (dark) / `#ffffff` (light); gutter `#858585` on same bg; active line `#2a2d2e`; selection `#264f78`; cursor `#aeafad`; bracket matching + indent guides; default text `#d4d4d4`. Add: minimap-free but with line highlight, bracket colorization, autocomplete popup styled like VS Code, Ctrl+/ comment, Tab indent, Ctrl+Enter run. Editor surface may differ from the app's panel color (like an embedded VS Code). Same theme reused in the author's code fields and theory code blocks.

## 5. New features that make work easier

**Learners**
1. Keyboard-first workspace: Ctrl+Enter run, Ctrl+Shift+Enter submit, `[` `]` previous/next step, `?` shortcuts sheet.
2. Resizable panes + saved layout; editor font size and tab size.
3. Progressive hints (reveal one by one), "Compare expected vs got" diff in failed tests, reset-to-starter with confirm, auto-saved drafts with "restored" toast.
4. Dashboard: streak, minutes today, next-up, resume where you stopped; course thumbnails.
5. Global search / command palette (Ctrl+K): courses, steps, settings.
6. Notes per step; bookmark steps.

**Authors**
1. Autosave + version history with restore.
2. Duplicate step/lesson/module; drag-and-drop reorder; bulk move.
3. Markdown live preview, slash-command (`/code`, `/quiz`, `/callout`), paste image to upload.
4. "Run reference solution against all tests" with one click; test generator from examples.
5. Publish checklist with deep links; "preview as student" in a side drawer.
6. Student insights: who is stuck (steps with many failed attempts), one-click message/invite.

**Admins**
1. Triage inbox for reports with assignees/status shortcuts; keyboard `j/k`.
2. Saved filters, CSV export, bulk actions.
3. Global Ctrl+K search over users/courses/reports.

## 6. Implementation phases and status tracker

Legend: ⬜ not started · 🟦 planned/ready · 🟨 needs your decision · ✅ done · ⛔ blocked
Status as of wave 1 (branch `redesign/2026-10-18`, commit 03a751c): ✅ = merged, audited by viewing screenshots, full suite 678/680 (the 2 failures are the pre-existing invitations-tab pair), build passes. Items marked ◐ are merged but have known gaps listed in the Notes column.

| ID | Phase / task | Fixes | Risk | Status |
|---|---|---|---|---|
| P0.1 | Commit or stash the ~100 uncommitted working-tree edits (clean baseline) | — | Low | 🟨 needs your OK |
| P0.2 | Design tokens: neutral palette, radius, spacing, type scale (`tokens.css`) | §2 | Low | ✅ lime accent kept. Editor surface stays neutral gray `#1e1e1e` next to the blue-black page: acceptable, VS Code-like |
| P0.3 | Shared components: Panel, Badge, Tabs, Table, EmptyState, Drawer, Skeleton, Toast polish | §2 | Low | 🟦 |
| P1.1 | VS Code Dark+/Light+ highlight map + editor surface colors | C11 | Low | ✅ seen dark+light in integrated build. Not applied to author code fields / theory code blocks |
| P1.2 | Editor chrome: font size control (persisted), reset code, shortcut hints, save indicator | C11, C12 | Low | 🟦 |
| P2.1 | Persistent shell, swap `<main>` only | C1, C7 | **Medium** (touches `renderApp`) | ⛔ skipped on purpose: ~130 whole-shell `innerHTML` writes; safe path is a `mountContent()` helper converted batch by batch (learner S3 pages first) |
| P2.2 | In-shell skeleton loaders, 150 ms delay | C2 | Low | ✅ |
| P2.3 | SPA step completion (no reload), success banner + Next step | C3, C6 | Medium | ◐ works; two Continue actions now show (toolbar + banner) |
| P2.4 | Retry without reload; branded leave-confirm dialog | C4, C5 | Low | ◐ author/profile guards done; appearance guard, deletes, invitations and starter-code reset still use `window.confirm`; `CoursePublishPage.ts:198` still reloads |
| P2.5 | Role-aware post-login landing + Learn/Teach/Admin switcher | C9 | Low | ◐ landing done (admin→/admin, author-only→/teach, student+author→/learn); switcher not built; 🟨 should student+author land on /teach? |
| P2.6 | Route polish: fade, scroll reset, focus to H1, document.title | C10 | Low | ✅ |
| P3.1 | Learner Home (merge Continue + My courses) | §3 | Medium | 🟨 decision 2 |
| P3.2 | Course page: collapsible modules, progress rings | §3 | Low | ✅ |
| P3.3 | Step pages: centered reading, outline slide-over, footer actions | §3 | Medium | 🟨 decision 3 |
| P3.4 | Python workspace: output drawer, reduced top bar, attempts tab, hint reveal | §3 | **Medium-High** | 🟦 |
| P4.0 | Reproduce the /help modal-on-load report in a clean browser; fix only if real | §1c | Low | ✅ real bug, cause `.modal-backdrop:not(.hidden){display:flex!important}` in `components.css`; fixed in `HelpPage.ts` |
| P4.1 | Settings: single account page, rail nav, dirty-only Save bar, shared Alert/danger styles | §1c | Low | ◐ card layout + danger/warning styles done; segmented font controls and rail nav not done; existing bug: Appearance page resets font/indent display after reload (`main.ts` ~3443 hardcodes values) |
| P4.2 | AI connections table + MCP setup stepper | §1c | Low | ✅ |
| P4 | Public landing/catalog/overview, auth, help, error pages | §3 | Low | ◐ merged; open polish: catalog thumbnail gradient is magenta/maroon (off-palette), sign-in/up value panel misaligned with form, help dialog checkbox centered |
| P5 | Author: single nav, tree DnD, live preview, Python stepper, publish checklist | §3 | High | ⬜ |
| P6 | Admin: triage overview, tables, thumbnails | §3 | Low | ◐ merged; needs server support for suspended-course count, safe media thumbnails, report severity; minor: duplicate badge/switch and duplicate 'Unavailable' on Execution |
| P7 | Features: Ctrl+K palette, notes, autosave history, shortcuts sheet | §5 | Medium | ⬜ |
| P8 | Extract touched controllers out of `main.ts`; delete dead demo step | C8 | Medium | ◐ dead demo step deleted; no controller extraction yet |

**Per-task rule:** change → `npm test` (existing suite, previously 659/661 with 2 known evidence-file failures) → `npm run build` → re-capture the same desktop screenshots → compare against the baselines in `screenshots/redesign-2026-10-18/` → update this table.

**Definition of "feels better" (measured after P2/P3):** no sidebar flicker on navigation; no blank page during loads (skeleton within the shell); no full reload on step completion; passing a task shows a clear success and one-click next step; leaving with unsaved work shows a branded dialog.

## 7. Decisions needed from you

1. **Accent color**: keep lime, or switch (indigo/teal)? Recommendation: keep lime as the only accent, tone it down.
2. **Merge "Continue" + "My courses" into one Home**? Recommendation: yes.
3. **Outline hidden by default in step pages** (slide-over)? Recommendation: yes for reading steps; keep it docked in the Python workspace only if the window is wider than 1600px.
4. **Scope of first implementation pass**: Phases 0–2 (tokens, VS Code editor, learner) recommended.
