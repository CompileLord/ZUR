# ZUR — Interface Design Specification

Version: 1.3
Date: October 4, 2026
Status: Implementation baseline (1.3 finalizes all phases P01–P45 UI polish, shells S1–S6, and Step-up modal dialog lifecycle tracked in [UI_POLISH_PLAN.md](UI_POLISH_PLAN.md))
Product contract: [PRD_V2.md](PRD_V2.md)
Audience: Product designers, frontend engineers, and AI implementation agents
Language: English

## 1. How to use this specification

Read this document together with PRD_V2.md. The PRD governs permissions, persistence, assessment, enrollment, and release scope. This document governs presentation, navigation, interaction, and visual consistency. If a visual idea conflicts with product behavior, preserve the PRD behavior and record the conflict rather than inventing a feature.

`MUST` is a requirement. `SHOULD` is the default unless a documented accessibility or layout constraint justifies a change. Routes are proposed frontend contracts; adapt their syntax to the framework without changing their meaning. No framework, component library, or editor theme may silently replace these design decisions.

Implement the shared system first, then pages. All page specifications inherit Sections 3–9 and the shared states in Section 15. The page-specific notes add requirements; they do not exempt a screen from loading, empty, error, permission, keyboard, or responsive behavior.

Do not implement P1/P2 features or show disabled promotional placeholders for them. This document adds no AI chat, payment, certificate, public profile, social feed, live-class, or notification-center interface.

External-agent authoring through MCP is a P0 extension defined in PRD_V2.md Section 23. It adds author connection settings and change review, not an in-app AI chat or course-generation composer. Section 19 specifies its interfaces; P43–P45 extend the original page inventory.

## 2. Design position and reference interpretation

### 2.1 Philosophy: room to think, evidence of progress

ZUR should feel like a carefully arranged study desk: an explanation beside a working surface, the next step apparent, and the surrounding tools quiet. Its identity comes from the relationship between teaching and practice, not decorative technology imagery.

Three recognizable decisions define the product:

1. **The lesson rail.** Numbered lessons and steps use a precise vertical alignment, a thin connecting rule, and an unmistakable current-step marker. The same geometry appears in the syllabus, course builder, and learning navigation.
2. **The paired workspace.** Instructions and code occupy adjoining surfaces with a shared baseline. Feedback appears where the learner works. A task never becomes a chain of disconnected forms.
3. **Citron as direction.** A muted yellow-green accent identifies the current location and the primary next action. Correctness uses a separate mint green. Completion, selection, and action must not collapse into the same signal.

The overall palette is warm charcoal with an extremely slight olive bias, off-white text, and restrained color. Reading areas have generous spacing; toolbars and operational tables have purposeful density. Minimalism means removing unnecessary decisions, not hiding essential controls.

### 2.2 Current official references

References were reviewed on September 24, 2026. These are documented principles and specific releases, not a claim to have audited every live interface variant.

| Reference | Grounded observation | ZUR interpretation |
|---|---|---|
| [Gemini's May 2026 design announcement](https://blog.google/innovation-and-ai/products/gemini-app/next-evolution-gemini-app/) | Google describes a new expressive visual language and streamlined tools. | Keep related actions together and make transitions legible. Use quiet feedback rather than importing its colorful visual identity. |
| [Google's Gemini visual-design discussion](https://design.google/library/gemini-ai-visual-design) | Google connects shape and visual behavior to communication. | Give the lesson rail a functional meaning; avoid decorative shapes without a purpose. |
| [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes), November 22, 2024 web update | The documented update addresses sidebar behavior, available content space, and mobile interaction. | Collapsible navigation should return space to reading and coding; preserve explicit access to essential actions. This historical reference does not describe every current ChatGPT screen. |
| [OpenAI design guidelines](https://openai.com/brand/) | The guidelines emphasize consistent identity and a balance of precision and approachability. | Use disciplined type and spacing with readable language; create ZUR's own wordmark and assets. |
| [Linear's March 2026 refresh](https://linear.app/now/behind-the-latest-design-refresh) | Linear describes dimmer navigation, reduced visual competition, and more consistent structure. | Establish fixed places for location, view controls, and task actions. Keep navigation subordinate to content. |

These references inform the direction, not the token values below. ZUR's colors, measurements, and patterns are original product decisions. Do not copy another company's proprietary fonts, symbols, gradient signatures, or exact layout.

### 2.3 Intended advantage, expressed as testable design choices

The following are product hypotheses, not unsupported claims that every competitor has these problems.

| Friction to avoid | ZUR response | How to assess it |
|---|---|---|
| A learner loses context when switching between instructions and code. | Both remain visible at supported desktop widths. | Complete an exercise without repeated page navigation. |
| Course creation becomes a sequence of settings screens. | One builder with contextual editors and a separate publication review. | Publish the first mixed lesson in the PRD usability target. |
| A quiet interface hides basic actions. | Run, Submit, Continue, Preview, and Publish remain labeled and discoverable. | First-time users find each without instruction. |
| A dashboard substitutes metrics for a clear next step. | Resume work is the dominant element; course rows provide context. | Returning students identify their next action immediately. |
| Dark styling produces unreadable gray text. | Explicit contrast-safe tokens and state labels. | Measure actual component contrast in both themes. |
| Attractive feedback conceals whether work was saved or graded. | Persistent save and assessment states with plain wording. | Users distinguish local recovery, server save, sample success, and assessment pass. |

### 2.4 Visual exclusions

Do not use purple-to-blue gradients, glowing edges, aurora backgrounds, glass panels, neon terminal styling, floating 3D objects, sparkle icons, fake AI assistants, stock student photography, decorative dot grids, oversized pill buttons, or a generic grid of feature cards.

Do not animate every entrance, add celebratory confetti, invent testimonials or usage statistics, or display decorative analytics. No gradient text. No shadows on every surface. No oversized greeting occupying the first screen. No repeated motivational slogans in the learning interface.

Plain surfaces and intentional whitespace are the default. A panel needs a border only when separation communicates containment, interaction, or independent scrolling.

## 3. Color system

### 3.1 Theme behavior

Dark is the default for first visits, including marketing and authentication. Settings offer `Dark`, `Light`, and `System`; an explicit stored choice always wins. Resolve the theme before the first paint. The light theme is a fully supported translation of the same hierarchy, not an inverted screenshot. Set the browser's form-control color scheme accordingly.

All application colors MUST reference semantic CSS tokens. Do not scatter hex values, opacity-based gray text, or framework palette classes through page code. Opaque surface tokens make contrast predictable. User-supplied images retain their original colors.

### 3.2 Canonical tokens

| CSS token | Dark | Light | Purpose |
|---|---|---|---|
| `--bg-canvas` | `#141613` | `#F5F6F0` | Main page and reading canvas |
| `--bg-navigation` | `#11130F` | `#ECEFE5` | Receding navigation shell |
| `--bg-surface` | `#1B1E19` | `#FFFFFF` | Contained content, fields, resume panel |
| `--bg-raised` | `#242822` | `#ECEFE5` | Menus, dialogs, active control backgrounds |
| `--bg-hover` | `#2C3129` | `#E2E7D9` | Neutral hover and pressed region |
| `--bg-selected` | `#303922` | `#E0E9CC` | Selected row or answer option |
| `--text-primary` | `#F1F3EA` | `#20251C` | Reading text, headings, active labels |
| `--text-secondary` | `#BDC3B5` | `#4E5847` | Supporting text and inactive navigation |
| `--text-muted` | `#A0A898` | `#5C6754` | Metadata, placeholders, timestamps |
| `--border-subtle` | `#343A30` | `#D5DBCB` | Decorative separators only |
| `--border-control` | `#78816F` | `#78816F` | Input bounds, unselected radio/checkbox edges |
| `--accent` | `#D4E88B` | `#485D18` | Primary action, current step, active underline |
| `--accent-hover` | `#E0EDA9` | `#3D5013` | Primary button hover |
| `--accent-pressed` | `#BDD36D` | `#32420F` | Primary button pressed |
| `--on-accent` | `#1A210D` | `#FFFFFF` | Text and icons on accent buttons |
| `--focus-ring` | `#D4E88B` | `#485D18` | Keyboard focus |
| `--link` | `#D4E88B` | `#485D18` | Inline links, underlined in prose |
| `--success` | `#94D5AD` | `#28633F` | Passed, completed |
| `--success-bg` | `#1A2D23` | `#E5F0E7` | Success feedback background |
| `--warning` | `#E7C17E` | `#79520E` | Unsaved, waived, recoverable warning |
| `--warning-bg` | `#30291C` | `#F6EDD8` | Warning feedback background |
| `--danger` | `#F2A49A` | `#A1362B` | Errors, failed verdicts, destructive actions |
| `--danger-bg` | `#342320` | `#F8E8E3` | Error background |
| `--info` | `#A9C8EB` | `#315D8A` | Neutral service or preview notices |
| `--info-bg` | `#202B35` | `#E7EEF6` | Informational background |
| `--code-bg` | `#171A15` | `#FBFCF7` | Editor and code blocks |
| `--code-active-line` | `#242A20` | `#EDF1E4` | Active editor line |
| `--code-selection` | `#2D3B22` | `#DDE8C7` | Selected code |
| `--overlay` | `rgb(0 0 0 / 60%)` | `rgb(20 22 19 / 35%)` | Modal backdrop only |

Control boundary contrast matters most for form fields, checkboxes, and resize handles. `--border-subtle` MUST NOT be used as the sole indication of an interactive control.

Selected backgrounds use primary text, not muted text. Disabled controls use secondary text, a neutral surface, and a semantic disabled state; do not reduce the opacity of an entire panel. Show the reason if the user could reasonably expect to use the action.

Primary buttons use `--accent` + `--on-accent`, never white text on dark-theme citron. Destructive confirmations use `--danger-bg`, a `--danger` border, and `--danger` text. Do not use a success-colored primary button or a red page background.

### 3.3 Editor syntax tokens

| CSS token | Dark | Light | Syntax |
|---|---|---|---|
| `--syntax-default` | `#E2E7D9` | `#273021` | Names, punctuation |
| `--syntax-keyword` | `#D4E88B` | `#485D18` | Language keywords |
| `--syntax-string` | `#B7D5AB` | `#365E2E` | Strings |
| `--syntax-number` | `#E7C17E` | `#79520E` | Numeric literals |
| `--syntax-function` | `#A9C8EB` | `#315D8A` | Function names and built-ins |
| `--syntax-comment` | `#A0A898` | `#5C6754` | Comments and secondary editor labels |

Use at most these six syntax colors. Editor selection must preserve legibility; do not make comment text semi-transparent. Error diagnostics use both a marker and text in the results region. Do not imply type checking or advanced diagnostics that are not implemented.

### 3.4 Color accessibility contract

Normal text must meet at least 4.5:1 contrast, large text at least 3:1, and required control/state indicators at least 3:1 against adjacent colors. See [WCAG contrast requirements](https://www.w3.org/TR/WCAG22/#contrast-minimum) and [non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast). A subtle decorative divider does not need to become a bright line to meet a requirement that does not apply to it.

Token arithmetic has been checked for the primary combinations; this does not certify the rendered product. Check actual pairs after opacity, selection, disabled state, charts, and overlays are applied. Small inactive metadata still needs to be readable. Do not use large-text exceptions for 14px labels.

## 4. Typography, geometry, and assets

### 4.1 Type

Use `Inter, ui-sans-serif, system-ui, sans-serif` for interface and reading text. Use `"IBM Plex Mono", ui-monospace, SFMono-Regular, Consolas, monospace` for code, step ordinals, and short technical identifiers. Bundle licensed font assets when available; system fallbacks must preserve usability during loading. Do not use proprietary OpenAI or Google typefaces.

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `display` | 56 / 60px desktop; 36 / 40px mobile | 500 | Landing headline only |
| `page-title` | 32 / 40px; 28 / 36px mobile | 500 | Page headings |
| `section-title` | 22 / 30px | 600 | Major sections and lesson titles |
| `subheading` | 18 / 26px | 600 | Subsections |
| `reading` | 17 / 29px; 16 / 27px mobile | 400 | Theory and problem statements |
| `body` | 15 / 24px | 400 | General interface copy |
| `control` | 14 / 20px | 500 | Buttons, inputs, navigation |
| `metadata` | 13 / 20px | 400 | Timestamps, counts, helper labels |
| `micro` | 12 / 16px | 500 | Nonessential compact annotations only |
| `code` | 15 / 24px | 400 | Default editor; user-adjustable 12–24px |

Express sizes in rem with a 16px root; never shrink the root to fit a layout. Inputs are at least 16px on narrow/touch layouts. Headings use modest negative tracking: -0.025em for display and -0.015em for page titles. Body tracking is normal. Use tabular numerals for counts and dates, sentence case for controls, and no uppercase navigation labels.

Reading columns are at most 68ch. Avoid justified text. Do not truncate lesson instructions, field errors, or destructive-action consequences. Long course titles wrap to two lines in rows; the detail page displays the full title.

### 4.2 Measurements

| Family | Values |
|---|---|
| Spacing | 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80px |
| Page gutter | 16px below 768px; 24px at 768–1199px; 40px at 1200px+ |
| Standard content width | 1120px maximum |
| Landing width | 1200px maximum |
| Form width | 640px settings; 400px authentication |
| Reading width | 720px maximum, with prose capped at 68ch |
| Radius | 6px small controls; 8px inputs/buttons; 12px panels; 16px dialogs |
| Control height | 40px standard; 32px compact desktop; 44px touch |
| Sidebar | 224px standard; 64px collapsed icon rail on desktop only |
| Workspace tree | 256px default; 224–320px resizable |
| Inspector | 288px default |
| Location header | 56px |
| Context toolbar | 44px, only when needed |
| Dialog width | 440px confirmation; 560px forms; 800px conflict comparison |
| Drawer width | 440px standard; 560px attempt detail |

Use pills only for small status badges or genuine segmented filters. Do not give reading panes rounded outer frames. Container surfaces are usually flat. Menus and dialogs may use `0 12px 32px rgb(0 0 0 / 24%)` in dark mode, `0 12px 32px rgb(20 22 19 / 12%)` in light mode. Shadows do not replace surface/border separation.

Z-index tiers: base 0; local sticky controls 10; shell 20; nonmodal popovers 30; modal backdrops 40; modal content 50; modal-local menus 55; toasts 60. Scope overlays correctly; page controls behind a modal are inert.

### 4.3 Icons, wordmark, and imagery

Use one consistent outline icon set, 18px in navigation and 16px inline, with approximately 1.75px strokes. Controls still have their full hit target. Icons supplement labels; ambiguous icons cannot replace `Run`, `Submit`, or `Publish`.

Icons are inline SVG using `currentColor`. Every sidebar navigation row has a leading icon. Step types use a fixed icon vocabulary everywhere they appear (syllabus, lesson rail, builder tree, analytics): file-text = Theory, video = Video, list-checks = Quiz, code = Python exercise. Type icons use neutral text color; do not use per-type hue chips (purple/red/yellow labels). Emoji are never used as interface icons.

The initial brand asset is a plain `ZUR` typographic wordmark, 20px semibold with slight positive spacing. A small citron vertical bar may sit to its left, relating to the lesson rail. No generated mascot or imitation AI symbol. The favicon can be a simple `Z` on canvas color. These are implementation assets, not a requirement for a separate logo project.

Courses are identified by title and metadata, not mandatory covers. Optional future cover support must not produce empty image placeholders now. Lesson images exist only when teaching requires them. Landing illustrations are accurate interface fragments made from the same components, not decorative raster scenes.

## 5. Shared layout shells and responsive behavior

### S1 — public shell

Horizontal header with ZUR left; `Courses` and `For teachers` links; `Sign in` right. `For teachers` links to the landing authoring section, not a new feature. On mobile, use one labeled menu. Footer contains Help, Privacy, Terms, and theme access. Keep marketing navigation out of study workspaces.

### S2 — account shell

Wordmark above a 400px form, centered horizontally and positioned approximately one quarter down the viewport. Short legal/help links below. No sidebar, testimonial panel, carousel, or split-screen decoration. Allow natural scrolling on small heights.

### S3 — application shell

Receding left navigation, location header, main content. Student navigation: `Continue`, `My courses`, `Explore`. Bottom utilities: Help and account menu. Author-capable accounts get an explicit `Learn / Teach` mode switch; this changes navigation, not identity. Admin appears only for authorized accounts. Avoid duplicated home/dashboard destinations.

The location header carries breadcrumb/context and page-level status only; it MUST NOT repeat the page H1 (leave it empty rather than duplicate). Each page has exactly one H1 at the top of the main region, 40px top padding, left-aligned, within the standard content width. The account menu is a single block: initials avatar, display name, and a menu (or compact icon buttons) for Settings and Sign out. The Learn / Teach switch reflects the current route: `/teach*` and author settings show Teach as active with author navigation.

### S4 — learning workspace

Replace the global sidebar with a course outline; do not stack two sidebars. Header: back to course, course/lesson context, saved status where relevant, and outline toggle. Step navigation sits within the workspace. Python uses the paired layout; theory/video/quiz uses a reading column. No public footer while studying.

Each step has exactly one task footer, pinned to the bottom of the viewport: `Previous` left, step position (`Step 3 of 7`) or step status center, primary action right. Do not render a second inline Previous/Next row inside the content, and never show `Next` and `Continue` at the same time. Report issue is a quiet ghost or overflow action. Save state appears once (near the editor for Python).

### S5 — author workspace

Header: back to courses, course title, publication/draft state, save status, Preview, and Review & publish. Under it, contextual tabs: `Content`, `Students`, `Analytics`, `Settings`. Content view has tree, editor, and optional inspector. Other tabs replace the editor region and omit the content tree. Preview opens the student layout with a clear return action.

### S6 — administration shell

Quiet `Admin` label badge, same tokens. Navigation: Lucide outline SVG icons (16/18px, 1.75 stroke, `currentColor`) paired with Overview, Users, Courses, Categories, Reports, Media, Execution, and Audit, using `aria-current="page"` and quiet active indicator styling. Operational density is higher than learning density, but typography and control sizes stay legible. Top header provides concise location context without repeating page H1s, alongside an explicit `Return to app` link. Account block matches S3 with avatar initials, display name, and acting admin role. Support access is explicit, never an invisible student impersonation mode.

### Breakpoints and collapse order

| Available viewport | Behavior |
|---|---|
| 1440px+ | Full author tree + editor + inspector; full paired study workspace. Do not stretch prose indefinitely. |
| 1200–1439px | Standard sidebars; inspector becomes an on-demand drawer if the editor would fall below 560px. |
| 1024–1199px | Study outline closed by default; paired problem/code view maintained. Author inspector is a drawer and tree can collapse. |
| 768–1023px | Reading and quiz fully usable; Python and full authoring show desktop guidance. Author roster/analytics remain readable. |
| Below 768px | Single column; navigation becomes a modal drawer, no permanent icon rail. Tables use approved responsive rows or local horizontal scrolling. |

Full coding/authoring is supported at widths of at least 1024px on desktop-capable devices. Width alone must not advertise mobile coding support. Browser zoom can trigger the compact reading layout without losing saved code or queued attempts. All supporting dialogs remain accessible at 320 CSS px.

For Python at 1024px+, hide the outline before reducing the problem pane below 340px or code below 480px. At narrower widths show the problem, synchronized code read-only, and the desktop guidance. A student may navigate to other steps without completing the coding step; do not introduce a lock.

Use document scrolling for ordinary pages. Workspaces may have separately scrolling problem, editor, and tree panes with labeled regions. Avoid a third nested scroll within prose. Sticky headers and actions must not obscure focused controls. Respect safe-area insets and the on-screen keyboard.

## 6. Shared components and interaction rules

| Component | Required anatomy and behavior |
|---|---|
| Page header | Title left, brief supporting sentence if needed, one primary action right. Wrap actions below title on small screens. |
| Primary button | Accent fill, on-accent label, 40px height, 8px radius, 16px horizontal padding. One dominant primary per working region. |
| Secondary / ghost button | Neutral surface or transparent background, primary text, clear hover/focus. No action depends on hover alone. |
| Icon button | Accessible name, tooltip on focus/hover, 32px minimum desktop hit area and 44px touch target. |
| Text input | Persistent label, surface background, control border, helper text below. Error uses icon + text and `aria-describedby`. Placeholder is never the label. |
| Select / combobox | Search only for long lists. Selected value is visible. Native control is acceptable if themed and behavior matches. |
| Checkbox / radio | Native semantics or complete accessible equivalent; visible selected indicator. Label and control form one target. |
| Tabs | Underline, label, active state; no pill inside a pill. Route tabs are links; in-page panels follow keyboard tab semantics. |
| Status badge | Compact text + relevant icon; semantic foreground/background. No colored dot with no explanation. |
| Course row | Title, one-line summary or current lesson, two or three useful metadata values, trailing action. A subtle divider separates rows. |
| Progress line | 4px visual track, a readable count such as `12 of 20 required steps`, and percentage when useful. Accessible value always present. |
| Lesson rail | 32px-wide ordinal column, 1px neutral rule, 8px marker. Current uses citron marker + label weight; complete uses check + mint; waived uses warning icon/text. |
| Content tree | Module → lesson → step, 16px indentation increments, 36px minimum row height, explicit disclosure controls and move menu. |
| Save indicator | Inline persistent status; `Saved` only after acknowledgment. Warning becomes actionable without moving other controls. |
| Empty state | Plain heading, one sentence, one appropriate next action, optional small functional icon. No giant illustration. |
| Table | Semantic headers, 48px minimum rows, consistent alignment, server pagination. Numeric values right-aligned. Row menus have distinct accessible names. |
| Drawer | Labeled title, close control, own scroll area; modal if it blocks interaction, otherwise no focus trap. Back returns to previous context. |
| Dialog | Descriptive heading and consequence; focus trap, Escape, return focus. Unsaved destructive dialogs must not dismiss on backdrop click. |
| Toast | Nonblocking confirmation, bottom-right desktop / above bottom actions mobile. Never the only location for errors or saved-work status. |
| Error panel | What happened, what remains saved, next action, optional support reference. Human-readable text precedes technical details. |
| Code block | Code surface, mono type, copy action with accessible confirmation, local horizontal scroll for long lines. |
| Report form | Type, concise description, contextual identifiers supplied automatically, optional submitted-code inclusion, Send report. |
| Filter toolbar | One row above a list/table: search field with leading icon, themed selects or segmented filter, result count right-aligned. Filters apply on change (debounced); no separate `Apply`/`Filter` button unless the query is expensive. No card around the toolbar. |
| Overflow menu | `More` icon button (accessible name includes the row/entity) holding secondary and destructive row actions (Leave, Revoke, Replace, Remove). The primary row action stays visible as a ghost button. |
| Settings section | Flat section separated by 32–48px spacing or one divider; optional two-column layout at desktop (label + one-line description left, controls right). Never stack bordered cards edge to edge. |
| Danger button | Destructive actions use `.btn-danger` / `.btn-destructive` with semantic `--danger` and `--danger-bg` tokens. |
| Segmented filter | Compact inline segmented button group (`.segmented-control-btn`, `.segmented-tab`) with `role="navigation"` and `aria-current="page"`, retaining server query semantics without dropdown friction. |
| Step-up confirmation | Sensitive mutations that require a reason and/or password re-entry open a 440–560px modal dialog from a clearly labeled action button (e.g. `New category`, `Review`, `Disable new execution…`). The page itself never shows idle reason/password fields. The dialog uses native HTML `<dialog>` with `margin: auto;` centering, viewport gutters (`max-height: calc(100vh - 48px); overflow-y: auto;`), stable `id` and `aria-labelledby`, and Lucide outline `x` close icon. The confirm button uses danger styling (`.btn-danger`, `--danger` token) when destructive. On any dismissal path (Escape, Cancel, Close icon, or backdrop click), a capture-phase `close` listener strictly purges all password inputs, reasons, and validation errors, restoring focus cleanly to the trigger. |
| Data formatting | Dates as `Oct 3, 1:50 PM` (relative within 24h, absolute in tooltip); never raw ISO strings. Enums humanized in sentence case (`broken_exercise` → `Broken exercise`). Long IDs truncated in mono with copy. Zero/unknown durations and empty metadata are hidden, not shown as `0m`. |

Navigation rows use a neutral selected surface and short citron leading marker. Avoid filling the entire sidebar item with bright accent. Prose links are underlined; a button or navigation link does not need a prose underline.

Course progress is cumulative satisfaction; an attempt result is a separate fact. A failed later attempt may show danger feedback while the lesson rail remains completed. Never display a percentage for queue progress or reference validation unless its denominator is real.

### Forms and action hierarchy

- Author content fields autosave. Account/security settings and access-changing operations use explicit Save/Confirm. Explain which behavior applies.
- A disabled action has an adjacent explanation or reachable helper text; do not make its reason available only inside an unfocusable tooltip.
- Inline field validation appears after blur or submission, not on every initial keystroke. On submit, focus the first invalid field and provide an error summary for long forms.
- Button loading states retain width and use precise text such as `Sending invitation…`. Prevent duplicate mutations without freezing unrelated navigation.
- Menus contain secondary actions. Primary task actions are always visible.
- Do not nest interactive elements inside a clickable course row. Use a title link plus independent action buttons.

## 7. Motion and feedback

| Interaction | Timing | Behavior |
|---|---|---|
| Hover/focus color | 120ms | Color only; focus indicator appears immediately |
| Menu | 140ms | Opacity and at most 4px translation |
| Drawer/dialog | 180ms | Opacity, at most 8px translation |
| Panel resize | Immediate | No animated lag behind pointer |
| Progress update | 180ms | Small width transition after server confirmation |
| Completed step | 160ms | Replace marker with check; no bounce or confetti |

Use `cubic-bezier(0.2, 0, 0, 1)` for entrances. Do not animate width on primary content during typing. Respect reduced motion: eliminate translations and progress animation; use static loading text when appropriate. The Landing sculpture uses pointer scrubbing on desktop and muted playback on mobile only while visible, with a pause control. Reduced-motion visitors receive a static poster.

Loading skeletons mirror the actual layout and are static, without continuous shimmer. Keep existing data during refresh and show a small updating state. Network feedback must be truthful: `Queued`, `Running`, and `Checking status` are distinct.

## 8. Content voice

Write clear, brief English. Use verbs that describe the result: `Create course`, `Run samples`, `Submit solution`, `Review & publish`, `Revoke access`. Prefer `You can try again` to blaming language. Technical detail belongs in expandable diagnostics when it helps troubleshooting.

Brevity rules: a page subtitle appears only when it adds information the title does not, and is at most one line. Helper text appears under a field only when it prevents an error. Internal or system vocabulary (`immutable`, `authoritative records`, `snapshot`, raw enum keys) is replaced with plain words or moved into an info disclosure/tooltip. PRD-defined metric names (e.g. `Learning-active students`) keep their label; their definition moves into a tooltip instead of a visible paragraph. Prefer one sentence over a paragraph; prefer a label over a sentence.

| Situation | Required wording direction |
|---|---|
| Sample run succeeds | `Samples passed. Submit your solution to complete this step.` |
| Submission passes | `All tests passed.` + visible Continue |
| Hidden test fails | `Your solution did not pass a hidden test. Review the input limits and edge cases.` |
| Infrastructure failure | `We couldn't check this submission. Your code is saved.` only if save is confirmed |
| Unsynced code | `Changes are stored on this device. Reconnect to sync.` only if local persistence succeeded |
| Version publication | `Existing students will continue on their current version.` |
| Quiz incorrect | `That answer isn't correct yet. Try again.` |
| Waived step | `This step was waived because of an issue with the exercise.` |
| Unsupported coding device | `Open this exercise on a computer to write and run code.` |

Do not claim code is saved when only submission status is known. If the draft is not confirmed saved, say `Your submitted code is available in Attempts` when that is true. Never include fake urgency, streak pressure, inflated praise, or claims of AI capabilities absent from the PRD.

## 9. Route and page inventory

Every page below is P0 unless labeled as an operational variant. Overlays and editor variants are specified separately so agents do not create unnecessary top-level navigation entries.

| ID | Route / surface | Shell |
|---|---|---|
| P01 | `/` — landing | S1 |
| P02 | `/courses` — catalog, search, category filters | S1 visitor; S3 signed in |
| P03 | `/courses/:courseId` — public/unlisted course overview | S1 / S3 |
| P04 | `/sign-in` | S2 |
| P05 | `/sign-up` | S2 |
| P06 | `/verify-email` | S2 |
| P07 | `/forgot-password`, `/reset-password` | S2 |
| P08 | `/join/:token` — invitation acceptance | S2 |
| P09 | `/learn` — continue dashboard | S3 |
| P10 | `/learn/courses` — enrolled courses | S3 |
| P11 | `/learn/:enrollmentId` — enrolled course overview and completion | S3 |
| P12 | `/learn/:enrollmentId/steps/:stepId` — theory variant | S4 |
| P13 | Same step route — video variant | S4 |
| P14 | Same step route — quiz variant | S4 |
| P15 | Same step route — Python variant | S4 |
| P16 | Step route + `/attempts/:attemptId` — history/detail | S4 nested view |
| P17 | `/settings/profile` | S3 |
| P18 | `/settings/appearance` | S3 |
| P19 | `/settings/security` | S3 |
| P20 | `/settings/privacy` | S3 |
| P21 | `/teach` — owned courses | S3 Teach mode |
| P22 | `/teach/:courseId/content` — course builder | S5 |
| P23 | Builder selection — theory/video editor | S5 |
| P24 | Builder selection — quiz editor | S5 |
| P25 | Builder selection — Python editor | S5 |
| P26 | `/teach/:courseId/preview` — draft preview | S4 + preview banner |
| P27 | `/teach/:courseId/publish` — review publication | S5 |
| P28 | `/teach/:courseId/students` — roster/invitations | S5 |
| P29 | `/teach/:courseId/students/:enrollmentId` — student detail | S5 |
| P30 | `/teach/:courseId/analytics` | S5 |
| P31 | `/teach/:courseId/settings` | S5 |
| P32 | `/admin` — operations overview | S6 |
| P33 | `/admin/users`, `/admin/users/:userId` | S6 |
| P34 | `/admin/courses`, `/admin/courses/:courseId` | S6 |
| P35 | `/admin/categories` | S6 |
| P36 | `/admin/reports`, `/admin/reports/:reportId` | S6 |
| P37 | `/admin/media` | S6 |
| P38 | `/admin/execution` | S6 |
| P39 | `/admin/audit` | S6 |
| P40 | `/help` | S1 / S3 |
| P41 | `/privacy`, `/terms` | S1 |
| P42 | Not found, access unavailable, suspension, service outage | Current safe shell or S2 |
| P43 | `/settings/ai-connections` — author access tokens and connection management | S3 |
| P44 | `/settings/ai-connections/:connectionId/setup` — compatible-client setup and verification | S3 |
| P45 | `/teach/:courseId/activity` — agent changes, diff, and draft recovery | S5 |

Query parameters hold shareable filter/tab state without sensitive tokens. Builder selection uses stable node identifiers. Browser Back restores the relevant list filters and scroll position. Invitation and recovery tokens must never be copied into analytics, public breadcrumbs, or unrelated return URLs.

## 10. Public and account page specifications

### P01 — Landing

**Purpose:** Explain the product through the act of learning and direct visitors to real courses.

**Composition:** S1, 1200px maximum. A left-aligned two-line headline, `Understand it. Then write it.`, occupies roughly seven of twelve desktop columns. Supporting copy: `Learn Python through short lessons and real exercises. Create a course that puts practice beside the explanation.` Primary action: `Explore courses`; secondary text link: `See how teaching works` scrolls to the authoring section.

Below the introduction, show one full-width, accurate workspace fragment: a short problem, 6–10 lines of example Python, and clearly labeled sample output. Use actual shared components. If this is a static illustration, label it `Example workspace`; never simulate a working Run action. The next section presents `Read → Try → Check` as three aligned text columns, not floating cards. A final authoring section shows a small course tree beside concise creation steps. Finish with one repeated Explore courses action and the footer.

**Visual rule:** Canvas background, primary text, citron action. The lesson-rail motif organizes the explanatory section. No huge blank hero, product badges, fabricated proof, pricing, or logo wall.

**Responsive/state behavior:** Stack the workspace illustration at mobile width and retain selectable, readable content. No horizontally clipped desktop screenshot. Signed-in visitors see `Continue learning` as the primary header action; do not redirect unexpectedly. All section links must reach actual sections.

**Interactive hero (user-approved update):** Preserve the headline, supporting copy, course routes, semantic palette, and example workspace. Animate the headline once with a reserved two-line height; expose the complete heading to assistive technology immediately. An optional transparent sculpture sits beside the copy on desktop and below it on mobile. Use a small local poster first and defer the optimized video until visible. Limit pointer seek requests, stop offscreen, and cancel route-owned listeners and animations on departure. The multi-select learning-interest pills acknowledge selections; they do not claim to filter or personalize catalog results. Teaching-only selection links to the authoring section; other selections lead to the real catalog. Use a labeled mobile menu with focus containment, Escape dismissal, and background inertness. Keep Tailwind utilities prefixed and omit its global reset so the hero does not alter other pages.

### P02 — Catalog and search

**Purpose:** Find an appropriate published course.

**Composition:** Page title `Explore courses`, then a full-width search field, then Category, Level, and Language filters in a single toolbar. Search supports title, description, tags, and author according to the PRD. Show the result count at the right of the desktop filter toolbar (with sensible placement on mobile beneath filters/sheet). Results are generous text-led rows: title, short description, author, level, content language, approximate duration, and `View course`. Category/tag metadata is quiet; it does not become a wall of chips.

**Actions:** Selecting a category updates the same page rather than creating a separate category navigation system. Search updates after a short debounce and preserves its query in the URL; Enter also submits. Use clear pagination controls rather than infinite scroll. Relevance applies when a query exists; default catalog ordering is consistent and server-defined, not a fabricated popularity score.

**States:** No courses: `Courses will appear here when they are published.` No matches: show the query and `Clear filters`. A request failure preserves filters and offers Retry. Do not show private, unlisted, archived, or suspended courses in results. On mobile, filters open a labeled sheet with Apply/Clear and the active-filter count.

### P03 — Public/unlisted course overview

**Purpose:** Help a visitor decide whether to join, without exposing learning content.

**Composition:** Title and short description at top; author, language, level, and duration beneath. Desktop uses a 2:1 main/summary arrangement: learning outcomes and prerequisites in the main column, compact enrollment summary in the secondary column. The syllabus follows as the numbered lesson rail, with module/lesson titles and step-type counts. Use a sticky enrollment summary only while it remains unobstructive; it is not a giant promotional card.

**Primary action by state:** `Enroll in course` for eligible signed-in open enrollment; `Sign in to enroll` for visitors; `Verify email to enroll` if unverified; `Invitation required` explanatory state for invitation-only courses. An already enrolled learner gets `Continue learning`. Revocation gets a safe explanation rather than a new Join button. Do not add an unsupported Request access workflow.

**Restrictions:** A syllabus is informational; clicking its lesson titles must not reveal step bodies. Unlisted pages omit discovery links that would register them in a catalog and follow the indexing policy. An unauthorized private-course request uses P42, not a blurred course preview. Mobile places the enrollment action after the summary and repeats it after the syllabus if useful, without a viewport-covering sticky advertisement.

### P04 — Sign in

S2 with `Welcome back`, visible Email and Password labels, show-password control, `Sign in`, recovery link, and `Create an account`. Permit password managers and paste. Preserve an authorized intended destination server-side; do not expose invite tokens in the UI. A submit error stays inline with form values retained except sensitive values where security requires clearing. Generic invalid-credentials wording avoids account enumeration. Submit busy state keeps the form dimensions stable. No social provider buttons until those providers are supported.

### P05 — Sign up

S2 with `Create your account`, display name, email, password, a concise requirements hint, and `Create account`. Link to approved Terms and Privacy text. Do not ask users to select Student versus Author; capabilities are additive. Do not invent a birth-date or guardian-consent flow while the PRD audience decision is unresolved. When signup is restricted, replace the form with accurate pilot eligibility information. Success transitions to verification, retaining invitation context safely.

### P06 — Verify email

S2 with a small mail icon, `Check your email`, masked destination, concise verification instruction, and `Resend email` with an accessible cooldown. Provide `Use a different account` through a safe sign-out path. Verification success has `Continue`; the destination is the pending join flow or student dashboard. Expired/invalid links show `Request a new link`. Rate limits and delivery failures are inline. Never display a success check before the server confirms verification.

### P07 — Recovery and reset

Forgot-password page: email field, `Send reset link`, and Back to sign in. The submitted screen uses the same generic message whether or not the address exists. Reset page: new password and confirmation, rules, show-password controls, and `Update password`. Invalid/expired token replaces the form with `Request a new reset link`. Success links to Sign in. A service failure is distinct from invalid user input. Do not reveal account identity from a recovery token before verification.

### P08 — Invitation acceptance

S2, slightly wider at 440px. Show only the authorized minimal course identity and inviter context. Heading: `Join [course title]`; short explanation of what access is being offered. Signed-out users see Sign in/Create account; verified eligible users see `Join course`. Show a text link to switch account where needed.

Expired, revoked, exhausted, already accepted, wrong-email, archived, and suspended states each get accurate copy. Wrong-email feedback does not reveal the recipient's complete address. A joined invitation offers Continue learning; reloading cannot add another enrollment. No syllabus, roster, private media, or course-description preview before the invitation and permissions are validated. Mobile retains this single-column layout.

## 11. Student page specifications

### P09 — Continue dashboard

**Purpose:** Resume meaningful work with minimal navigation.

**Composition:** S3. Heading `Continue learning`; one dominant resume panel with course title, current lesson, step name, required progress count, and `Continue`. This panel uses surface fill, 24px padding, a small citron leading rule, and no background image. Below it, show up to four other enrolled course rows and `View all courses`.

**States:** A first-time learner sees `Your next lesson starts here` plus Explore courses and a short note that an invitation link can be opened directly. Do not add an invitation-token input. If all courses are complete, the leading panel becomes `Your courses are complete` with Review courses and Explore courses. Archived courses with active access remain resumable; suspended courses provide status instead of a dead Continue action. No activity heatmaps, streaks, public ranks, or empty analytics widgets.

### P10 — My courses

S3 with title, `In progress / Completed / All` filters, and enrolled course rows. Each row has title, next/resume step, required-step count, and an action. The enrollment's version appears in secondary details, not as the main label. Left/revoked enrollments appear only in a separate `Previous enrollments` section with appropriate rejoin/reinstatement guidance. Leaving requires confirmation explaining retained records and access loss. Filter empty states do not look like the user has no courses at all. Mobile stacks row metadata and keeps the action reachable.

### P11 — Enrolled course overview and completion

S3, 960px reading-oriented main region. Show title, enrolled-version label, progress count, approximate duration, and Resume/Review. The syllabus uses the lesson rail; modules expand into lesson and step rows. Each step has type, required/optional label, and completion state. Navigation remains open even for incomplete steps.

Completion is a calm inline summary at the top: `Course complete`, completed date, satisfied required-step count, and `Review lessons`. Waivers are explicitly included as a separate count. Do not generate a certificate, grade, share badge, or confetti. A completed course still allows practice without removing the completion summary. An archived course has an unobtrusive `Archived — you can continue learning` notice. A waiver notice links to its explanation without exposing private support details.

### P12 — Theory step

S4 with a course outline and a central reading column. Top content line: `Lesson 2 · Step 1 of 5`, type, and Optional if applicable. Then the step title, content, inline media, and a footer with Previous, `Mark complete and continue`, and an overflow Report issue action. Existing completion changes the primary action to `Continue`; do not record a duplicate completion on navigation.

Keep the statement in the canvas, not inside a padded card. Code examples use the code surface and Copy. Heading levels are visually and semantically consistent with the editor preview. At mobile width the outline is a drawer and a labeled Course outline button remains visible. At the last step, the action leads to the next lesson or the course overview. Merely scrolling does not change progress.

### P13 — Video step

Use the same anatomy as P12. Video appears beneath the title in a stable aspect-ratio region capped by the reading container. Provide title, playback controls from the approved provider, and a visible `Transcript` disclosure immediately below. Captions or a transcript must be available as required by publication validation.

Playback is user-initiated. Do not auto-complete based on time watched. Use `Mark complete and continue` below the content. On embed failure, preserve layout and offer Retry and transcript access; do not trap learning behind a broken player. External provider notices use secondary copy. No Related videos area or unrelated content supplied by ZUR.

### P14 — Quiz step

S4 with a 640px question column. Show the prompt, optional media, and vertically stacked options with 12px spacing. Options are flat surface rows with a control border and at least 48px height. Radio or checkbox control remains visible. Multiple choice says `Select all correct answers` before the options.

Use `Check answer` as primary action, disabled with helper text until a valid selection exists. Submission keeps the selected choices stable. Wrong answers produce a compact error panel below the options with Try again; never disclose correct-option metadata before passing. Correct answers show a success strip, explanation, and Continue. Selected citron and passed mint are different states. On revisit, preserve completion while allowing another attempt; explain that practice does not reset completion. Mobile has the same hierarchy, not a swipe interaction.

### P15 — Python workspace

**Purpose:** Let a student understand, experiment, submit, and recover without losing context.

**Desktop composition:** S4, edge-to-edge workspace. Course outline is optional. Problem pane occupies approximately 40% of the remaining width, editor/results 60%; enforce the minimums from Section 5. The right side has a 44px toolbar, code editor, and a resizable results region with a default height near 220px at a 900px-tall viewport. At short heights, results collapse to a labeled tab strip until opened; retain at least 240px of usable editor height where possible.

```text
Course / Lesson                         Saved       Outline
──────────────────────────┬─────────────────────────────────
Step 3 of 5               │ Python [runtime]      Editor menu
Title                     ├─────────────────────────────────
Problem                   │  1  numbers = input().split()
Input / Output            │  2  ...
Constraints               │
Examples                  ├─────────────────────────────────
Hints                     │ Results   Custom input   Attempts
                          │ No runs yet. Try a sample first.
──────────────────────────┴─────────────────────────────────
Previous        Step status          Run samples   Submit solution
```

**Actions:** Run samples is secondary; Submit solution is primary. The Run control includes a clearly labeled choice for custom input. Keyboard Run invokes the selected run mode and displays its name. Reset and editor preferences belong in the editor menu, with Reset confirmation. Always show a save indicator near the editor, not only in the global course header.

**Problem pane:** Title, statement, input format, output format, constraints, public examples, then sequential hints. Expected/sample values use code formatting. Solution explanation appears only after a pass and only if the author supplied it. Report issue is a quiet text action after the problem.

**Results:** Default text explains that Run does not complete the exercise. Public failures show labeled Input, Expected, and Received regions; preserve whitespace and provide a readable difference treatment using icons/labels as well as color. Render output as text, never HTML. Cap output and say when it is truncated. Hidden failures show only the safe verdict and guidance, without captured output, tracebacks, test indexes, or timing. Infrastructure failures use info/warning styling and a retry action, not student-failure red.

**In-flight behavior:** After acceptance show an attempt identifier in details, `Queued` then `Running`, and reconnect status when needed. Keep editing possible, with `Checking submitted version` to make the snapshot distinction clear. After passing, preserve the results and reveal Continue in the task footer; further Run/Submit remain available as secondary practice actions. Do not show a fake queue position, percent complete, or animated terminal typing.

**Compact behavior:** Below the supported coding layout, keep statement, hints, existing results, and last synchronized code in read-only mode. Show desktop guidance and Previous/Next navigation. Do not fabricate a disabled tiny IDE or hide the entire lesson. A width change never resets the editor model or cancels a server job.

### P16 — Attempt history and detail

Attempts opens in the workspace results region as a table/list: time, verdict, and attempt number. Selecting one opens a 560px drawer on wide layouts and a nested full-page view on compact layouts. Direct links resolve to the same detail. Header shows verdict, submitted time, and runtime version; code is read-only with Copy. Include `Restore to editor` only for the student's own editable desktop workspace, with confirmation before replacing a draft.

Infrastructure outcomes are clearly labeled and excluded from student error summaries. Hidden-result redaction is identical to P15. Use pagination; no false “only 50 attempts exist” message. Loading or unavailable attempts preserve the student's current code. Author/support variants reuse the read-only detail but never offer Restore to editor for another student's work.

### P17 — Profile settings

S3 with a settings subnavigation and 640px form column. Show editable display name, verified email as account information, and explicit Save changes. Do not add public biography, social links, avatar upload, or public profile routes. If changing email is not supported by the chosen authentication service, provide the approved support path rather than a nonfunctional input. Unsaved navigation warns only when there are actual edits. Success confirmation is inline; no full-page success screen.

### P18 — Appearance settings

Three labeled radio choices: Dark, Light, System, each with a small schematic preview using real tokens (mini sidebar, heading line, text lines, accent button — never an empty box). Preview selection immediately and persist the preference on change with an inline `Saved` / failure message; no separate `Save preferences` button. Add editor font size and indentation preferences used by P15 (same autosave behavior); make clear they affect the code editor. Avoid a full theme builder, accent picker, or multiple unrelated density sliders. System mode displays the currently resolved theme as secondary text.

### P19 — Security settings

Plain stacked sections for password change/recovery, authentication state, and `Sign out of all devices`. Show only capabilities supported by the selected provider. Admin accounts additionally show required stronger-authentication setup and status. Destructive session revocation has a confirmation explaining whether the current session will end. No fabricated device list; display actual sessions only if the backend supports them. Reauthentication failures retain the user's navigation context safely.

### P20 — Privacy and account requests

Explain what learning data is stored in brief text, with links to the approved policy. Separate `Request data export` and `Request account deletion` sections. Requests show submitted/pending/completed/failed status if available from the support process, without inventing instant self-service deletion.

Deletion uses a consequence dialog. A sole course owner sees the required transfer/archive support step and cannot be told deletion succeeded while ownership is unresolved. Do not include deceptive extra confirmations, a retention-offer screen, or a bright red entire page. Approved retention copy must replace any development placeholder before launch.

## 12. Author page specifications

### P21 — Author courses

S3 Teach mode. Header `Your courses` with `New course`. Below: Draft, Published, Archived filters and text-led course rows showing title, publication state, unpublished-changes indicator, student count, and last edit time. Draft rows use `Continue editing`; published rows use `Open course`. Do not show a giant analytics overview above the courses.

New course opens a 440px dialog containing only Course title, helper text `Starts as a private draft`, Cancel, and Create course. Success opens P22. No category or visibility wizard. Empty state shows this same action and a small sample tree as noninteractive explanatory content. Accounts without author capability see an accurate access message; do not invent a self-service approval application.

### P22 — Course builder and structure

S5 Content view. Persistent course tree left, editor center, contextual inspector right when space allows. Tree rows show ordinal/type, title, draft validity indicator, and an accessible more menu. Add module sits at tree bottom; Add lesson/step is contextual and available to keyboard/touch users, not exclusively on hover.

Selecting the course shows its structure summary and links to settings. Selecting a module shows its title and lessons. Selecting a lesson shows title, optional description, ordered step rows, duration summary, and Add step. The step menu has exactly Theory, Video, Quiz, and Python exercise. Show `20 of 20 steps` and explain the limit rather than silently rejecting creation.

Reorder has drag handles and Move up/down/Move to actions. Announce the new position and preserve focus. Duplicate creates a new item and selects it; published-step type changes require creating a replacement. Delete confirmation identifies children and explains that published versions stay intact. Tree selection survives autosave and refresh. On collapse, the tree remains available from a labeled Structure button.

### P23 — Theory and video author editors

**Theory:** Editable title above the rich-content canvas, matching student type width. A modest formatting toolbar contains common formatting and an Insert menu for tables, images, code, callouts, and dividers. No permanently expanded toolbar with dozens of icons. Paste/import sanitization errors describe what was removed without destroying valid text. Required flag and estimated duration live in the inspector.

Image insertion shows processing status inside its final footprint. Selecting an image opens alt text, Decorative checkbox, caption, replace, and remove controls. A missing required alternative is a validation warning, not placeholder prose inside the lesson.

**Video:** Title, approved video URL field, resolved preview, caption verification/transcript field, and duration. Explain unsupported providers near the URL. No upload-video button. On provider failure the author can edit the URL and transcript; the existing draft is preserved. Both variants use autosave, selection-consistent focus, and Preview as student.

### P24 — Quiz author editor

Title and rich prompt first, then a Single choice/Multiple choice selector. Each option is an editable row with answer-key control, option text, and Remove. Add option is visible until the eight-option limit. Label answer-key controls `Correct answer`, not merely a colored tick. Explain at least two options and the valid correct-answer pattern.

An Explanation section is below the options, labeled `Shown after a correct answer`. Required and estimated duration remain in the inspector. Changing from multiple to single choice with several correct options asks the author to choose the remaining correct answer; never silently change the key. Preview uses a separate student interaction state and does not mutate the answer key.

### P25 — Python exercise author editor

Within S5, use four contextual tabs: `Problem`, `Code`, `Tests`, `Validation`. Preserve a small validity summary across them. Do not split the exercise across unrelated settings routes.

- **Problem:** Title, statement, explicit input/output format, constraints, hints 1–3, and optional student explanation labeled as post-pass content.
- **Code:** Starter code and private Reference solution as clearly separated editor sections or sub-tabs. A persistent private label accompanies reference code. Runtime and limits appear in the inspector with units and supported bounds.
- **Tests:** Public and Hidden sections with counts. Rows show author-only input/expected output and visibility, expandable into paired code-style fields. Add test is primary within this region. Empty input/output is valid and must not be mistaken for missing fields. Changing visibility explains student exposure before saving a hidden-to-public change.
- **Validation:** `Check reference solution`, current configuration revision/status, and a list of failing tests or a passed summary. Results become `Needs recheck` when relevant settings change. In-flight status is real, not a fake progress percentage.

Use warning/info surfaces for invalidated validation, danger for actual failing checks, and success only for confirmed reference passes. The author can see hidden diagnostics here because this is an authorized author surface; never reuse that payload on the student route. A validation run and the unsaved code editor must clearly identify which revision was checked. Default runtime-limit fields are collapsed behind `Execution limits` until needed; required validation status is never hidden.

### P26 — Student preview

Render P12–P15 using draft data and the actual student components. An always-visible information strip says `Preview — your actions won't affect student progress`, with `Back to editor`. Respect intended step ordering and type behavior. Do not show hidden tests or reference code inside the preview even though the author can inspect them elsewhere. At unsupported widths, preview the real desktop-guidance behavior. Link back to the exact edited step.

### P27 — Review and publish

S5 with a centered 800px review region rather than a small confirmation modal. Header `Review publication`, draft revision and save state. Body order: blocking issues, warnings, course summary, visibility/enrollment summary, version-impact statement, then Publish. Issues are grouped by module/lesson and link to the exact field; returning preserves review context.

Publishing is unavailable while required saves/validation are incomplete. Show how to fix the problem adjacent to the action. For updates, prominently state that existing enrollments remain on their version; no migration toggle is present. Final button is `Publish course` or `Publish new version`, never simply `Confirm`.

Success displays the released version and time, with View course and Invite students. It is not a launch celebration. A stale revision response returns to review with an explanation and revalidation, never publishes a different revision silently. Duplicate clicks remain one publication operation.

### P28 — Students and invitations

S5 Students view without content tree. Header count and `Invite students`; toolbar contains Search students, enrollment-status filter, and version filter. Tabs: Enrolled and Invitations. Roster columns: student display name, enrolled version, required progress, last learning activity, access state, and row menu. Avoid exposing full email in the default roster when not needed.

Invite dialog has Email and Shareable link tabs. Email contains recipient, expiry explanation, and Send invitation. Link contains expiry, optional use limit, Generate/Copy, and Revoke. Show delivery failure separately from link validity. The invitation list includes recipient context, state, expiry, and resend/revoke actions. Rotating a link explains that existing enrollments remain.

Revoke-access confirmation names the student and course; it explicitly does not delete the account. Reinstate is visible for revoked entries. No bulk CSV import, class-code generator, or co-teacher permission screen in P0. Mobile rows stack progress and state beneath the name; destructive actions stay in a labeled menu.

### P29 — Student detail

S5 with Back to students, display name, enrollment version/state, progress summary, and last learning activity. Below, a lesson rail presents required step status and submission counts. Selecting an assessment opens its submitted-attempt list and the shared read-only detail.

Do not expose unsent code, other courses, IP addresses, or unrelated profile details. A waiver is labeled separately from a pass. A teacher can `Report broken exercise` with the pinned version attached and request support; there is no teacher-side completion-override switch. Page data must update appropriately if access is revoked without losing the historical evidence authorized by the PRD.

### P30 — Course analytics

S5 with course-version filter and labeled reporting window. Top region is a horizontal definition list of Active enrollments, Learning-active students, Completion, and Average progress. Use separators, not four brightly colored metric cards. Under it, show an exercise table with distinct participants, pass rate, median attempts to pass, and last activity where available.

Metric definitions follow PRD Section 14. Counts and denominators accompany percentages. Small samples show the sample size without invented confidence claims. Waivers and infrastructure failures are separate annotations. Do not include trend charts unless the backend supplies comparable time-series data; a clean table is the P0 default. `No assessed attempts yet` replaces an empty chart or misleading 0% pass rate. Mobile stacks metric definitions and permits local table scrolling.

### P31 — Course settings

S5, 640px form width. Sections: Basics, Learning outcomes/prerequisites, Discoverability and enrollment, Publication/version information, Archive/delete. Category, tags, difficulty, and language belong to Basics. Visibility and enrollment are visibly separate controls with concise explanations. Private automatically constrains invitation-only enrollment and explains why.

Content metadata uses the draft autosave indicator and becomes student-visible through publication. Live delivery settings that affect discovery or access use an explicit `Apply access settings` action and summarize their immediate effects; do not imply they wait for draft publication. Existing enrollments remain active when visibility changes.

Show published versions as a read-only list sufficient to identify releases, not a Git-style history UI. Archive/restore requires a consequence confirmation consistent with the PRD. Delete is offered only for a never-published draft. Do not show ownership transfer as a self-service feature; route unresolved ownership changes to support.

## 13. Administration and support page specifications

Admin pages inherit the same visual system. They use meaningful tables and explicit actions, not a separate dashboard template. Every sensitive mutation shows scope, affected entity, reason field where required, and an audited confirmation. Narrow screens may use local table scrolling, but confirmations and forms must reflow.

Reason and administrator-password fields live only inside the Step-up confirmation dialog (Section 6) opened by the action; pages lead with their table or status, not an idle mutation form. Tables use the shared Data formatting rules: humanized enums, status badges, readable dates, and truncated identifiers with copy.

### P32 — Operations overview

S6 with a restrained `Platform status` heading and a relative timestamp for the last refresh (`Updated [relative]` with full ISO datetime tooltip). Status-card grid (2×3 calm cards on desktop): Execution, Queue, Runner telemetry, Internal-error rate, Outstanding reports, and Email delivery, each displaying title, semantic status badge, key metric, hint, and action link. Incidents appear as a prioritized alerts strip linking to operational pages. Healthy state is a concise badge (e.g. `No 5xx errors`), not a full-screen banner. Missing or reset runner telemetry displays `Unavailable` with an explanatory disclosure for volatile memory and heartbeat status, never an invented healthy state. The execution kill switch remains on P38 to avoid accidental interruption from the overview.

### P33 — Users and user detail

List: search, account-status/capability filters, display name, necessary identity field, verification state, capabilities, and account state. Detail uses labeled sections for identity, capability changes, suspension, and support requests. Grant author/revoke author and suspend/restore are explicit audited actions; show their consequences. Do not offer a routine “log in as student” button.

To inspect protected learning records, require a support-reason entry and show an active support-access banner throughout the resulting view. Privacy/export/deletion requests have a documented status and relevant ownership blockers. Do not make irreversible deletion an unlabeled table icon. Generic admin failures preserve the reason text safely for retry.

### P34 — Courses and course detail

List published state, visibility, owner, latest version, suspension status, and relevant report count. Detail has metadata, release list, availability controls, and relevant audit/report links. Suspension is distinct from author archival. Before suspension, state that existing learners also lose learning/execution access. Restore removes only the administrative override; it does not change the owner's archive setting.

A support-only `Waive broken step` operation requires version, step, affected-enrollment scope, and reason. Review shows a concrete count and explains that the result satisfies progress without recording a pass. Never represent a waiver as a green assessment result. Admin course editing is not the default support action.

### P35 — Categories

Table-first layout with category name, slug, usage count, and an `Edit` action button per row. `New category` (page header action) opens a compact step-up modal dialog with name, reason, and admin password; row `Edit` opens the edit step-up dialog with populated fields, rename controls, and an explicit replacement category selector (`<label for="edit-category-replacement-id">`) required if in use. On dialog dismissal (Escape, Cancel, Close icon, backdrop), sensitive reason and password fields are purged immediately and focus is restored to the trigger button. Validation catches normalized duplicates. Renaming describes its course-label effect. Removing an in-use category requires explicit reassignment; do not orphan required categories.

### P36 — Reports and report detail

List with segmented status filter (`All`, `Open`, `Investigating`, `Resolved`) using nav semantics (`aria-current="page"`) that preserves server query parameters, humanized report type and status badges, course/step context, relative submitted dates, and status. Detail shows the submitted report, permission-safe context, optionally attached submitted code, and internal investigation notes if implemented. Status changes are explicit. Links open the exact immutable course version snapshot, not the newest revision by assumption.

Report resolution requires a clear outcome record. This is private support, not a comments thread or live chat. Any user-facing resolution text must be distinguished from internal notes. Do not add email-send actions unless the product supports and authorizes them. Code supplied with consent remains protected.

### P37 — Media operations

Table of assets with processing/quarantine state, type, size, owning course, and reference count. Full UUID is truncated in mono with an accessible tooltip and verified clipboard copy feedback. Detail and mutations are housed in a step-up modal dialog opened by row `Review`, containing an authorized safe preview, review verdict, reason, and password (preventing bloated inline table rows). Assets referenced by retained published versions cannot be casually deleted. Failed or pending previews display a placeholder icon rather than rendering unsafe content or bypassing authorization. There is no public media library.

### P38 — Execution operations

Top: compact service status card (`Execution: Enabled` / `Paused`) with a danger-styled `Disable new execution…` button that opens a step-up confirmation modal dialog (reason + password). Confirmation names the scope: new jobs stop, reading and saved code remain available. Below: queue age, accepted/running counts, concise worker health (`Active` / `Unavailable` with explanation tooltip), infrastructure failures, and paginated job records. Stat tiles use `min-width: 0`, box sizing, and wrapped hints to prevent horizontal viewport overflow. Time-range controls are themed. Worker details are operational, not exposed to learners. Default job rows do not reveal source code or hidden payloads.

### P39 — Audit

Read-only searchable table with relative time, actor, action, target, reason summary, and correlation identifier. Table cells for timestamp, actor, and action prevent awkward wrapping (`.admin-nowrap`). Primary search and reason filter sit on a single row, with additional filters (actor, course, dates) organized into a collapsible "Advanced filters" disclosure, preserving all 8 server query parameters. Action labels are humanized on a single line with raw action codes accessible in tooltips and aria-labels. Detail reveals permitted structured changes without sensitive payloads. Audit rows cannot be edited or deleted from this interface. Do not show passwords, tokens, hidden tests, or raw code. Empty search and unavailable audit service are distinct states.


### P40 — Help and reporting

Reading-oriented page with short sections for account access, course access, saving work, Run versus Submit, and contacting support. Use an in-page contents list; a search box is unnecessary for a small static guide. Contextual Report issue opens the shared report form with course/version/step attached, while this page provides the approved general support contact.

After a report submission, show the reference and realistic next step. Do not claim a response-time commitment that has not been approved. Support is reachable outside sign-in for recovery and access issues. No chatbot, discussion board, or fake live support availability.

### P41 — Privacy and Terms

S1 with 720px reading column, title, effective date, and a simple contents list for long documents. Use approved policy content only; development placeholders must be visibly marked and block launch. Links remain underlined. No consent-shaped decorative switches, unnecessary animations, or marketing callouts inside legal text. Theme and zoom behavior match the rest of the application.

### P42 — System and access pages

Use a calm message within a 560px region, with a small icon, clear title, explanatory sentence, and safe actions.

| Condition | Presentation |
|---|---|
| Unknown or unauthorized private resource | `This page isn't available.` Centered within a 560px region with a small icon, safe primary `Browse courses`, and secondary ghost `Go back` that falls back safely when history is unavailable; no private title or existence details. |
| Signed-out access to known permitted destination | `Sign in to continue.` Preserve only a safe return destination. |
| Revoked enrollment | `Your access to this course has been removed.` Use authorized context only; no immediate Rejoin. |
| Course suspended | Explain learning is unavailable and link to support; do not render cached protected content. |
| Account suspended | Explain the account restriction safely, provide support and sign-out. |
| Service unavailable | Explain affected operation, Retry, and what work is actually retained. |
| Execution disabled | Keep content/editor where permitted; show a persistent execution notice with retry guidance. |
| Offline | Keep available work readable, distinguish local recovery from server save, and disable only network-dependent actions. |

Do not replace a recoverable in-page failure with a full-screen 500 page. Full pages are for route-level failures. No humorous blame messages or oversized error-code typography.

## 14. Shared overlays and critical transitions

| Surface | Trigger and content | Completion behavior |
|---|---|---|
| New course | P21; title only | Open new private draft |
| Add step | Builder contextual menu; four supported types | Select new step and focus title |
| Reset code | Editor menu; consequence and Cancel/Reset | Restore starter only after confirmation |
| Restore attempt | Student attempt detail; replacement consequence | Copy snapshot into current draft, preserve historical attempt |
| Save conflict | Newer server revision detected | Compare local/server content; choose reload or recover local copy; no silent overwrite |
| Leave course | Student course menu | Confirm access loss, retain records per policy, return to My courses |
| Revoke access | Owner roster | Confirm student/course scope, reflect server state |
| Rotate/revoke invite | Owner invitations | Explain future-join effect, preserve existing enrollments |
| Delete draft node | Builder row menu | Name children/scope; published snapshots unaffected |
| Archive course | Course settings | Explain existing-student access and blocked new enrollment |
| Report issue | Step footer or Help | Preserve entered description on failure; show reference on success |
| Sign-out with pending work | Account action | Explain unsynced edits; allow synchronization or explicit discard before clearing local account data |

Conflict recovery uses plain code/text comparison with labeled Local changes and Saved version. Both are selectable for copying. Do not implement an automatic merge of rich content unless its correctness is separately established. A sensitive-action confirmation always names the object; `Are you sure?` alone is insufficient.

All overlay forms use the same field/button components. Never open a drawer containing another drawer. Replace its body or navigate to a nested detail view with Back. Error feedback appears inside the active overlay, not underneath it.

## 15. Universal state contract

Every route and data-dependent component has a deliberate state model. Protected content is never painted before authorization resolves.

| State | Visual and interaction rule |
|---|---|
| Initial loading | Stable shell; content-shaped skeleton; region marked busy; no fake counts. |
| Background refresh | Retain prior data, label updating if needed; do not jump scroll or focus. |
| Empty account/course | Explain why the region is empty; show one valid creation/discovery action. |
| No filter matches | Retain query/filter controls; offer Clear filters. |
| Validation error | Field message plus summary for long forms; focus the first relevant control. |
| Permission failure | Remove protected content and use safe access wording; never just disable its buttons. |
| Not found | Safe route-level message; do not infer or disclose a private entity. |
| Offline editing | Persistent warning, truthful recovery status, no false Saved indicator. |
| Save failure | Preserve recoverable data; Retry; warn before destructive navigation. |
| Stale revision | Stop conflicting overwrite/publish; present the conflict flow. |
| Rate limited | Explain the affected action and server-provided retry interval; retain code/form input. |
| Queued/running | Show actual status; keep unrelated work available; reconnect to persisted job. |
| Service error | Distinguish infrastructure from learner mistakes; safe reference + retry. |
| Success | Inline confirmation located near the action; persistent records in their normal views. |
| Archived/suspended/revoked | Separate messages and permitted actions; never one generic Disabled badge. |

Do not clear input on failed mutations. Do not optimistically mark assessment completion or publication success. Use polite live-region announcements for asynchronous changes; reserve assertive interruption for errors requiring immediate attention. A screen reader must not receive every polling update or keystroke-save status as a new announcement.

## 16. Accessibility and responsive acceptance

The target is WCAG 2.2 AA. These rules supplement, rather than replace, a full audit.

- Provide landmarks, one page-level heading, logical heading order, and a Skip to content link.
- Use a 2px visible focus ring with 2px offset and sufficient contrast; do not clip it inside overflow regions.
- All ordinary touch controls target at least 44×44px; compact desktop controls target at least 32×32px. These ZUR targets are deliberately larger than the [WCAG 2.2 minimum target-size baseline](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), whose exceptions should not become the default layout strategy.
- Support keyboard-only forms, outline navigation, reordering, splitter adjustment, code editing, menu use, dialogs, and result inspection. Splitters expose labeled separator semantics and keyboard increments.
- Provide an editor escape-to-navigation mechanism and a visible shortcut explanation. No global shortcut hijacks browser navigation or ordinary typing.
- Announce completed/failed/waived/current states through text, not color alone. Use `aria-current` on active navigation and a meaningful progress label.
- Keep interface controls and reading content usable at 200% text zoom and 320 CSS px reflow; code/tables may scroll locally when their two-dimensional structure requires it.
- Dialogs do not overflow the viewport; their content scrolls while actions remain reachable. Sticky actions do not cover inputs or validation messages.
- Test reading order after responsive changes. Visual CSS reordering must not create an incoherent keyboard sequence.
- Respect reduced motion and forced-colors mode. Use system colors where necessary rather than suppressing the user's contrast settings.
- Do not rely on tooltips for required instructions. Ensure explanatory copy remains accessible on touch.

## 17. Implementation-agent contract

### Required implementation order

1. Read PRD_V2.md and this document; identify the page IDs in scope.
2. Create the semantic theme tokens, typography, spacing primitives, and accessible controls.
3. Implement shells S1–S6 as reusable layouts; do not copy header/sidebar markup into every route.
4. Build one vertical slice: author exercise creation → validation → publication → enrollment → student submission → completion.
5. Expand into the remaining page inventory using shared components and state contracts.
6. Verify dark and light themes, adverse states, mobile reading, and desktop workspaces before considering the UI complete.

### Code and behavior rules

- Page code composes semantic components; it does not invent a page-specific palette or spacing scale.
- Use real backend state where available. Development fixtures must be deterministic, clearly isolated, and never presented as live product evidence.
- All visible actions work, navigate to a real destination, or explain a legitimate unavailable state. No silent click handlers, fake uploads, fake analytics, or simulated grading in a production flow.
- Keep public, student, author, and admin payloads separate. Hiding a field in CSS does not protect tests or answers.
- Keep editor models stable across renders and pane resizes; loading a status update must not recreate the code editor.
- Persist shareable view state in safe URL parameters and personal layout preferences locally/account-side as appropriate. Do not put code, answers, personal data, or secrets into URLs.
- Do not add an AI prompt composer because this document is intended for AI agents. The product remains an LMS.
- If a library cannot meet an accessibility requirement, adapt or replace the component; do not remove the requirement.
- Implement only the chosen stack's equivalent of these patterns. The spec does not require a dependency for every component.

### Representative fixture set

Use one internally consistent sample course, `Python foundations`, with modules Variables, Conditions, and Loops. Include theory, video with transcript, single-choice quiz, multiple-choice quiz, and stdin/stdout exercise. Include a long title, a blank-input test, a long traceback for public tests, a hidden failure, an old-version enrollment, a waiver, and a suspended course.

Fixture learner names and data are fictional and must not be mistaken for real traction. Do not add a catalog of dozens of invented courses to make a screenshot feel populated.

### Required visual checkpoints

Capture and inspect the implemented UI at 1440×900, 1024×768, 768×1024, and 390×844, plus 320px reflow and 200% zoom. At minimum inspect:

1. Landing and catalog with real-length titles.
2. Sign-in validation and invitation-expired state.
3. Student dashboard empty and populated.
4. Theory with code/image and video-failed state.
5. Quiz selected, incorrect, and passed.
6. Python idle, public failure, hidden failure, unsaved, queued, and passed.
7. Author builder with a deep tree, long title, and open inspector.
8. Python author tests and stale reference validation.
9. Publication blocked and successful.
10. Roster filters, student detail, and sparse analytics.
11. Admin course suspension and audited waiver confirmation.
12. Settings in both themes and keyboard-focused modal controls.
13. AI connections empty/populated, token permissions, one-time secret reveal, and expired/revoked states.
14. Agent setup with a supported bearer-token client and an unsupported OAuth-only client.
15. Remote draft updates, concurrent-edit conflict, agent-change diff, and recovery confirmation.

Verify that the specification's 45 page/view IDs are represented in the implementation or explicitly recorded as not yet implemented. Editor variants are not separate top-level menu entries.

## 18. Design quality gate

A screen is ready only when its visual hierarchy, behavior, content, and state transitions all pass review.

| Check | Pass condition |
|---|---|
| Identity | Warm charcoal, citron direction, lesson-rail structure, and paired learning surfaces are recognizable without a logo. |
| Hierarchy | The current task and next action are identifiable immediately; supporting navigation recedes without becoming unreadable. |
| Restraint | Every card, border, color, icon, and animation has a functional purpose. |
| Scope | No unapproved features or decorative placeholders imply missing product capabilities. |
| Consistency | Shared controls have the same labels, dimensions, focus states, and token usage across roles. |
| Data truth | Save, progress, grading, publication, and operational status reflect confirmed state. |
| Safety | Hidden data never reaches student presentation paths; destructive operations explain scope. |
| Accessibility | Measured contrast, keyboard use, readable zoom, meaningful labels, and responsive focus behavior are verified. |
| Recovery | Network failure, stale content, expired invitations, and execution failure preserve recoverable work and offer a next step. |
| Responsiveness | Small screens support their promised learning functions; desktop guidance does not trap navigation or lose work. |
| Content | Realistic course content fits; no lorem ipsum, fake statistics, unsupported claims, or vague AI marketing remains. |

Do not judge the result only from a pristine dashboard screenshot. ZUR's distinctive quality should remain visible while a learner fixes a mistake, an author repairs a broken test, or a connection fails.

## 19. External AI connections and agent authoring

### 19.1 Interaction model

An author issues a revocable credential in ZUR, configures it in a compatible external AI agent, and grants selected course permissions. The agent uses MCP to change ordinary course drafts. The Course Builder remains the place to inspect, edit, validate, preview, and publish those drafts manually.

Keep the interface grounded in control and authorship: which connection, which courses, what permissions, what changed, and how to revoke or recover. Use the existing flat surfaces, typography, status labels, and citron action color. Do not add an AI orb, sparkle badge, agent avatar gallery, chat composer, fake typing indicator, or special gradient theme.

The author, not the model, creates and broadens access. A token is a secret for client connection settings, not text to paste into a conversation. Neither the setup page nor the builder should instruct users to send a token to an agent in a prompt.

### P43 — AI connections

**Access and navigation:** Add `AI connections` to the account-settings navigation for verified author-capable accounts. An unauthorized direct route shows the safe access state. The page uses S3 and the same settings column rhythm as Profile/Security; a connection table can expand to 960px. Show a link to this page in Teach mode's account menu, not a new top-level AI workspace.

**Heading:** `AI connections`. Supporting sentence: `Let your tools create and edit courses with access you control.` Primary action: `Create access token`. Provide a short `How connections work` disclosure covering the author-issued token and compatible-client setup.

**Empty state:** `No AI connections yet.` Explain the course-authoring use case in one sentence. Offer Create access token and a secondary View setup guide. Do not display provider logos or claim one-click connection to a product that has not been tested.

**Populated state:** Text-led table with Connection name, Access summary, Courses, Last used, Expires, and Status. Status values are `Never used`, `Active`, `Expired`, and `Revoked`. Active means an authenticated request was observed, not that the agent is currently online. Course summaries are `3 selected courses` or `All owned courses, including future courses`; details reveal the actual permitted set. Token identifiers appear only as short, non-secret references in the details panel.

**Actions:** Setup, View activity, Replace token, and Revoke. Place Revoke in the row menu and details view with a consequence confirmation. Keep expired/revoked tokens discoverable via a status filter; they are not silently removed. Do not offer Reveal existing token. Token details show scope grants, created/expiry time, last successful request, and safe client label. Client labels are not verified vendor identities.

**Responsive behavior:** Mobile uses connection rows with access/status under the label and a 44px menu target. Secret controls and connection summaries remain readable at 320px. Do not hide publishing/deletion permissions inside a horizontally scrolling column.

**States:** Loading preserves the settings shell. Failed list retrieval offers Retry without an empty-state Create prompt. Lost author capability blocks token issuance with an explanation. Failed revocation keeps the connection active until confirmed; never optimistically show Revoked.

### Token creation dialog

Use a 560px dialog or full-page sheet on narrow viewports. Field order:

1. Connection name, such as `My course-writing agent`; no vendor impersonation implied.
2. Permission preset: Read only, Draft authoring, or Full course control.
3. Expandable detailed scope checklist using the exact scopes in PRD Section 23.3.
4. Course access: Selected courses or All owned courses. Selected courses uses an author-only searchable checklist; never search global courses.
5. If course creation is enabled, explain that new courses created by this token join its allowed set. A token may start with no selected existing courses when it can create new courses. Otherwise require at least one selected course or all-owned access.
6. Expiry: 1, 7, 30, or 90 days, with 30 selected by default and an explicit local-date preview. No Never option.
7. A plain-language grant summary and `Create token` action.

Default preset is Draft authoring. It includes course read/create, content edits, media upload, and reference validation. Publishing, deletion, and live access changes are off by default. When selected, Full course control plainly states: `This connection can edit and delete draft content, publish validated versions, change course access settings, and archive or restore permitted courses.`

Read only is a distinct choice. Changing presets updates the detailed checklist and summary; manual edits change the preset label to Custom. Scope dependencies must be visible and enforced. Reauthentication occurs before creation as required by the backend, with focus and form state preserved across that flow. Do not ask for the same grant confirmation again after successful issuance.

### One-time token reveal

After creation, replace the dialog body with `Save your access token`. Show the token in a selectable, initially masked field, Reveal, Copy token, and the statement `You won't be able to view this token again.` Display the connection name, scopes, course access, and expiry alongside it.

Copy is an explicit user action; never write secrets to the clipboard automatically. Copy success says `Token copied`, not the token value. Token text must not appear in toast content, analytics, session-replay recordings, URLs, HTML attributes used for diagnostics, or persisted browser storage. Exclude the secret region from any capture instrumentation.

The primary action is `I've saved it — view setup`. Closing early explains that a lost token must be replaced. This is a one-time credential handoff, not a second grant approval. Later opening Setup must never reconstruct or reveal the secret. A secret can be held in short-lived in-memory UI state for this reveal only.

### Token revocation and replacement

Revocation dialog identifies the connection and permitted courses: `This connection will lose access. Existing course content will remain.` Include Cancel and Revoke token. On success update status and disable setup actions that imply the token remains usable.

Replace token performs reauthentication where required, creates a new credential with the same or narrower grant, revokes the old one, and opens the one-time reveal. Explain that the agent configuration must be updated. Widening access is a separate new grant, never an unnoticed side effect of replacement. Activity records retain non-secret attribution to the old token.

### P44 — Connection setup and verification

**Composition:** S3, 800px maximum. Back to AI connections, connection name/status, then a numbered vertical setup sequence using the lesson-rail geometry:

1. **Choose a compatible client.** Show only verified setup guides with tested client/version and credential method. Offer a generic bearer-token guide. If the selected client requires OAuth, show `This client requires OAuth. The current connection supports manually configured bearer tokens.` Do not present a nonfunctional Connect button.
2. **Add the MCP endpoint.** Display the actual deployment URL, transport `Streamable HTTP`, and a Copy endpoint control. Development uses the real loopback address with a Local development label; production must not show a fake domain as if live.
3. **Set the credential securely.** Describe the client's secure secret/header setting or supported environment-variable adapter. Use placeholder examples; never insert a real token into downloadable configuration or shell command arguments by default. Provider-specific JSON is shown only for a tested schema. Otherwise show neutral labeled fields instead of guessed syntax.
4. **Verify access.** Instruct the client to call `get_author_context`. The page displays the last observed authenticated call, timestamp, token label, and granted scope summary. `Refresh connection status` performs a read-only status check. It does not claim the agent connected merely because configuration text was copied.

**Optional example prompt, with Copy prompt:** `Create a private draft course on Python loops with one module, three lessons, Markdown explanations, an uploaded diagram, and exercises with reference solutions. Validate the draft and summarize the changes.` The prompt never contains credentials. If the token lacks one of these capabilities, adapt or annotate the example rather than guaranteeing it will work.

**States:** No observed requests: `Waiting for the first authenticated request`. Authentication error: explain expired/revoked/incorrect credential without echoing it. Missing scope: link to the permission summary; the agent cannot expand its own access. Connected state indicates when the last request happened and whether it was a safe context check or another operation. Do not claim the full workflow was tested from a handshake alone.

**Layout rules:** Configuration snippets use code surfaces and Copy controls; long URLs wrap or scroll locally. On mobile, steps remain stacked with full instructions. Use warning styling for compatibility limitations and info styling for setup guidance; no permanent bright-green connected banner.

### P45 — Agent activity and draft recovery

**Entry points:** Course Builder's `Recent changes` action and a connection's activity link. The course page uses S5 without the structure tree. Keep the main Content/Students/Analytics/Settings tabs intact; Activity is a contextual route, not a permanent extra primary tab. A connection-wide link opens P43 details with a filtered activity summary and course links; never show unauthorized course details.

**Composition:** Header `Agent activity`, course name, and filters for connection, operation, outcome, and date. Rows show time, connection label, action summary, affected content, outcome, and revision. Summaries use concrete verbs: `Updated 3 theory steps`, `Uploaded a diagram`, `Published version 4`, or `Changed enrollment to invitation-only`.

**Details:** Open a labeled drawer containing the operation summary, prior/new draft revision, affected nodes, validation result, and correlation ID. Content changes show a readable before/after comparison; Markdown code and image alt/caption changes are inspectable. Highlight deletions with text and symbols as well as color. Never display access tokens, signed URLs, learner records, or raw hidden test payloads in the generic activity list. Authorized assessment inspection remains in the author exercise tools.

**Recovery:** Offer `Restore previous draft` only for retained recoverable content changes. The review dialog explains the exact course revision being restored, subsequent draft changes that would be replaced, and that a new draft revision will be created. Recheck the current revision before commit. Make explicit: `Published versions, student progress, and live access settings won't be rolled back.` A content restore does not undo a publication, archive action, or visibility change.

Restoring through the author UI uses the author's permissions; restoring through MCP must also satisfy the credential scopes for its actual effects. Missing recovery data displays the retention reason and offers current-content inspection, not an impossible Restore action. Conflicts require a fresh review. Large diffs paginate/expand sections without losing context.

### 19.2 Builder updates caused by agents

The save indicator continues to describe the author's current local edit. A separate, quiet update strip says `Updated through My course-writing agent · just now` with View changes and Load update. Do not replace `Not saved` with a remote `Saved` event.

- With no unsaved local edits, load the new revision without unexpectedly moving focus, or offer Load update when the selection would be disrupted.
- With local edits, preserve them and show the normal conflict comparison. Do not silently overwrite either side.
- A selected node deleted remotely gets an explanation and a safe parent selection; preserve recoverable local text separately.
- A successful publication event shows the new release identity without changing pinned enrollments.
- An active course limited token creates drafts under the same ownership and privacy rules as the UI; the author sees them in Your courses with ordinary draft styling.

Attribution belongs in recent changes, not an AI badge on every paragraph. Author-facing validation errors produced through MCP use the same field links and messages as UI-created content.

### 19.3 Markdown and image states in the editor

MCP-authored Markdown renders as ordinary rich content. Do not maintain a separate read-only “AI content” block. A document can move between agent and manual edits while preserving supported structure and asset references.

An incoming image occupies its reserved dimensions with `Processing image`. Ready assets render with the same alt/caption controls as manually uploaded images. Invalid, quarantined, unauthorized, or missing assets show an actionable placeholder and block publication. Never display the signed upload URL or a broken browser-image icon as the only error.

When a diagram's alternative text is absent, select the image and highlight the same required metadata fields used by P23. A caption is not automatically treated as alt text. Decorative status remains explicit. Image generation is performed by the external tool; ZUR offers upload/rendering support, not an unimplemented Generate image button.

### 19.4 Additional state and quality checks

| Scenario | Required presentation |
|---|---|
| Token expired or revoked | Clear status, last-use history retained, Replace/Create action; no false active indicator |
| Agent attempts a forbidden operation | Activity records denied operation with safe scope guidance; course remains unchanged |
| Full-control grant publishes successfully | Normal publication result with agent attribution; no redundant approval modal |
| Course restricted token has no existing courses but can create | Explain that it can create and manage new courses only |
| Course ownership or author capability changes | Access summary refreshes; permission loss is explained without exposing other owners' data |
| Agent batch contains a conflict | Show failed/no changes applied and the revision conflict; no partial success illustration |
| Uploaded image is still processing | Stable placeholder and publication blocker linked to the image |
| Connection test has never run | Waiting/Not verified, never Connected merely because setup text exists |
| Token is copied | Minimal confirmation with no secret in status text |
| Course restored from a recovery revision | New draft revision shown; old published and enrolled versions unchanged |

Verify P43–P45 with keyboard use, masked-secret accessibility, dark/light contrast, long scope summaries, mobile dialogs, and real server states. This specification defines the planned experience; it does not assert that an MCP server or authorization backend has already been built.
