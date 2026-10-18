# Prompt for the next interface review agent

Audit the current Zur application and write an actionable redesign plan. This task is analysis and planning only: do not implement product changes.

Workspace: `/home/compilelord/new/vibecoding/zur`. Development URL: `http://localhost:5173` when running. Inspect the repository instructions and available app before starting. Preserve existing work and real user data. Use disposable fixtures for interactions that change data; do not publish courses or alter real accounts.

## Objective

Make the interface minimal, coherent, predictable, and fast to use. Investigate styling, layout, interaction behavior, navigation, and underlying page structure. Propose a complete structural change when it solves a demonstrated problem. Do not redesign a page solely to make it look different.

## Evidence and review order

First read only the recommendations in `docs/audits/2026-10-05-real-user-audit-report.md`. Select useful recommendations under the principles below, and explain briefly which you selected. Existing recommendations and plans are evidence, not requirements to accept uncritically.

Use these screenshot locations:
- Learner: `docs/audits/2026-10-06-redesign-implementation/learner/navigation-fix/` for the latest navigation corrections; `learner/minimal/` under the same root for the latest full minimal-layout review.
- Author: `docs/audits/2026-10-06-redesign-implementation/author/independent-audit/`.
- Admin: `docs/audits/2026-10-06-redesign-implementation/admin/recheck/`.
- Public/account: `docs/audits/2026-10-06-redesign-implementation/public/`.
- Historical coverage: `docs/audits/2026-10-06-redesign-implementation/INDEX.md`.
- Accepted scope and limitations: `docs/audits/2026-10-06-redesign-implementation/STATUS.md` and `AUDIT.md`.

Screenshots exist, but some are historical and coverage is incomplete. Verify dates and compare evidence with the current app. Capture missing or outdated states at desktop resolution only, preferably 1440×900; keep desktop width for full-page captures. Save captures grouped by role, page, theme, and state with a manifest recording route, viewport, theme, and whether a fixture was used. Exclude terminal summaries and browser error pages from product screenshots.

Review strictly one group at a time:
1. Learner and its shared authenticated navigation. Inspect screenshots and actual behavior, then finish that group's written plan and coverage inventory.
2. Author. Inspect that group, then finish its plan and inventory.
3. Admin. Inspect that group, then finish its plan and inventory.
4. Public and account. Inspect that group, then finish its plan and inventory.

Do not inspect screenshots from the next group before writing the current group's plan. After all groups, consolidate shared fixes and cross-role journeys without duplicating work.

## Principles and concepts

1. Every visible element serves a clear user purpose. Remove decorative controls, redundant text, duplicate navigation, excessive labels, and avoidable empty space. Keep necessary instructions and accessibility labels.
2. Make the primary action clear. Secondary actions remain discoverable without competing visually. Never use mock controls or status messages that imply nonexistent behavior.
3. Keep controls in predictable locations across routes and states. Opening or hiding a sidebar must not move its toggle to the opposite side.
4. Use one coherent visual system: consistent typography, spacing, colors, borders, icons, button hierarchy, feedback, and interaction patterns. Light and dark themes need equivalent clarity and contrast.
5. Keep navigation stable while page content scrolls. Sidebars scroll independently only when their own content exceeds the available viewport. Avoid unnecessary nested scrolling.
6. Preserve the learner's useful structure: modules and lessons on the left; compact task squares above; task-type icons and distinct green completion states; instructions on the left and code on the right for programming tasks.
7. Keep execution controls compact and together in the top bar. Run executes code and shows plain stdout/stderr; Test samples compares against examples; Submit performs assessment. Do not conflate these actions or imply that execution proves correctness.
8. Keep editor behavior familiar: readable VS Code-style syntax colors, a visible cursor in both themes, standard editing shortcuts, and Ctrl+Plus/Minus to change editor font size. Avoid unnecessary active-line highlighting, filename/runtime labels, placeholder overflow menus, or bulky toolbars.
9. Make selection and assessment truthful. Unchecked quiz options must not look selected. Success, failure, disabled navigation, completion, and retry states must agree with actual state.
10. Present quiz actions as a coherent flow: check the answer, show useful feedback, then provide a clear next step when allowed. Avoid unrelated or competing Check/Next/Continue controls.
11. Hide routine autosave chatter when it provides no useful decision. Retain actionable save failures and conflict recovery, with concise language near the editor.
12. Provide clear exits and preserve navigation continuity. A focused learner workspace must still offer an obvious compact return to the main page. Authenticated course exploration should preserve the app navigation and visual context.
13. Preserve users' work and context across navigation: code drafts, selected lesson, sidebar state, filters, and relevant scroll position. Identify actual losses, including back/forward and reload behavior.
14. Use subtle purposeful motion for state changes, with reduced-motion support. Navigation must feel responsive; avoid flicker, unexpected layout shifts, and needless remounts.
15. Minimalism must preserve discoverability and accessibility: meaningful names, keyboard access, visible focus, adequate contrast, understandable icons, and useful errors. Do not remove essential controls merely to reduce element count.
16. Prefer concise task-oriented wording. Eliminate text that repeats a heading, button, or visible state. Do not delete authored educational content without explaining the learning impact.
17. Judge complete user journeys as well as individual pages. A clean screenshot does not establish a usable interface.

## Known navigation regressions to verify

The learner's missing main-page exit and the disappearing sidebar on authenticated Explore have just been corrected. Verify those corrections in the current app; do not propose them again based only on old captures. Check catalog loading, loaded, filtered, error, and course-overview states for consistent authenticated navigation.

Investigate similar issues on every page: missing exits, dead ends, broken links, controls that move, unexpectedly disappearing sidebars, inconsistent shells within one journey, competing navigation, lost context, and browser back/forward behavior. Record source route, destination route, observed behavior, and proposed correction for confirmed issues. Explain intentional focused-workspace differences rather than forcing all pages into an identical layout.

## Required inspection

Build a route inventory from the code and actual app. For each page, inspect relevant normal, empty, loading, error, success, selected, completed, expanded/collapsed, long-content, and modal states in both themes. Mark unavailable states as unverified rather than inventing findings. Check desktop layouts at the standard capture size and a narrower desktop width where needed. Read rendering code and CSS to confirm behavior that screenshots cannot establish.

Follow real links and buttons through major journeys: dashboard → Explore → course overview → enrollment → learning → main page; learning across task types and attempts; author editing → preview → validation; administrative actions and recovery; public discovery and account entry. Use safe fixtures where needed.

## Deliverables

Save these under a new dated directory in `docs/audits/`:
- One plan per group, written immediately after reviewing that group.
- A separate coverage inventory listing every route/state reviewed, compliant, requiring changes, or unverified, with screenshot references.
- A shared-component and navigation plan that consolidates cross-page fixes.
- Screenshot folders and manifest for fresh evidence.

Include only pages with demonstrated problems in the change plans. Pages that already follow the principles belong in the coverage inventory, not in a speculative redesign backlog.

For each planned change include:
- Page and route, screenshot evidence, and observed behavior.
- Specific problem and violated principle.
- Exact proposed changes: what to retain, remove, move, simplify, or restructure.
- Why the change improves the user's task.
- Shared components and affected routes.
- Priority and status: Proposed.
- Dependencies and implementation order.
- Observable acceptance criteria, interaction checks, and required after screenshots.

Distinguish confirmed defects, design judgments, and unresolved questions. Use concrete before/after behavior rather than vague instructions such as 'modernize' or 'improve UX'. Preserve working functionality and the accepted learner split layout. Do not claim the whole interface passes based on a few happy-path screenshots.

Finish with paths to the plans, coverage inventory, and screenshots; the highest-impact findings; and remaining evidence gaps. Do not implement changes during this task.
