# ZUR implementation rules

These rules apply to frontend, backend, worker, and MCP code for ZUR. They supplement [PRD_V2.md](PRD_V2.md), [design.md](design.md), and [tasks.json](tasks.json). They do not change the product scope.

## Read the source before coding

1. **Read `design.md` completely, from beginning to end, before starting any product-code task.** Do not rely on a summary, a page excerpt, the mockup, or a previous agent's memory. On a later task, read the current full file again so changed design requirements are not missed.
2. **Read the necessary parts of `PRD_V2.md` completely before coding.** Identify the task's domain, then read its whole relevant sections and subsections, including tables, edge cases, acceptance criteria, and release gates. Always check PRD Sections 4–9 and 16–18 for scope, permissions, versions, accessibility, and system boundaries when they affect the change. Read Section 23 in full for MCP work. For changes spanning domains, read every affected section; when scope is uncertain, read the full PRD.
3. Read the corresponding task in `tasks.json`, the relevant P01–P45 page specifications, shared design Sections 3–9 and 14–18, and any connected workflows. Identify the required loading, empty, denied, offline, error, and recovery states before implementation.
4. The PRD governs behavior, permissions, persistence, assessment, enrollment, and release scope. The design governs layout, navigation, interaction, copy, visual tokens, and responsive behavior. If they appear to conflict, preserve PRD behavior, document the conflict, and resolve the presentation without inventing a feature.
5. P0 is the initial release. Do not implement or display P1/P2 features, fake controls, or promotional placeholders. Treat unresolved PRD Section 22 choices as decisions to record, not permission to invent policy.

## Code quality

- Write small, cohesive modules with descriptive names and explicit interfaces. Keep business rules in domain services rather than duplicating them across routes, pages, workers, and MCP tools.
- Use **few code comments**. Prefer code that explains itself. Add a short comment only for a non-obvious invariant, security boundary, protocol constraint, or decision that cannot be conveyed clearly by names and types. Do not comment every function, repeat what a line does, or leave stale TODOs as a substitute for implementation.
- Validate at system boundaries and use typed, structured errors. Do not swallow failures, replace them with success, or clear recoverable user input on failure.
- Do not add a dependency solely for a visual effect or a small helper. Choose framework, providers, and runner technology through recorded architecture decisions; the specifications do not mandate a stack.
- Use deterministic, isolated development fixtures. Never present fixtures, fake grading, invented analytics, or mock connectivity as production behavior.
- Add tests for security, persistence, concurrency, grading, accessibility, and other meaningful behavior. Avoid tests that only mirror implementation details. Verify the relevant PRD acceptance IDs for each completed task.

## Backend and data rules

- Use a relational store as authoritative state, object storage for media, a durable execution queue, and a separate isolated Python execution boundary. Keep timestamps consistent in storage and display them in the user's local timezone. Use server-side pagination where the PRD requires it.
- Enforce authorization on **every API and media request** and again before committing a sensitive or long-running mutation. Resolve ownership and capability from authenticated context, never client-supplied `author_id` or guessed resource IDs. Return safe denial responses that do not reveal private object details.
- Keep public, student, course-owner, administrator, and MCP payloads distinct. Hidden tests, answer keys before passing, private reference code, unsent student drafts, credentials, and signed URLs must never enter unauthorized responses, browser events, downloads, analytics, or routine logs. Hiding a field in the frontend is not security.
- Keep course drafts revisioned and published course versions immutable. Publish only the exact saved and validated revision in one atomic transaction. Pin existing enrollments to their version. Preserve historic nodes, assessments, and referenced assets while retained enrollments depend on them.
- Make joins, invitations, submissions, worker results, progress writes, and MCP mutations idempotent where specified. Use expected revisions for concurrent edits. Reject stale writes instead of silently overwriting. Store one authoritative terminal result per execution and never award completion twice.
- Run student code, author reference solutions, and previews under the same reviewed isolation controls. Use fresh processes per test, deny network/host access and secrets, enforce the PRD's exact source, test, CPU, wall, memory, disk, process, output, rate, and queue budgets, and destroy sandboxes after crashes and timeouts. Reject overload before accepting a job as an attempt.
- Implement Run and Submit as separate operations. Run never completes an exercise. Submit grades an immutable code snapshot. Keep public diagnostics useful; redact hidden input, expected output, captured stdout/stderr, test identity, and timing from every student-accessible path. Infrastructure failures are not wrong answers.
- Use one canonical rich-content model for manual editing and MCP Markdown. Sanitize content and links, validate image bytes and metadata, authorize asset references on render/preview/export, and respect immutable-version references on deletion.
- Use the same domain services and validation for UI and MCP. Implement MCP with the official SDK and authenticated Streamable HTTP transport. Enforce token scopes, course restrictions, expiry/revocation, idempotency, batch limits, and revision conflicts server-side. Tool annotations are descriptive only; they never replace permission checks. Tokens are one-time secrets and never belong in prompts, URLs, command arguments, analytics, or logs.
- Keep audit events for sensitive administration, support access, waivers, token use, and agent mutations. Store only permitted metadata in general logs. Follow the approved retention, export, deletion, and backup re-deletion policy; do not treat proposed PRD pilot values as legal requirements.

## Frontend rules

- Build shared semantic theme tokens, typography, spacing, accessible controls, and shells S1–S6 first. Compose pages from shared components. Do not scatter page-specific color values, substitute a library's default design system, or copy another product's identity.
- Implement the page IDs and routes in `design.md` without adding extra top-level entries for editor variants or overlays. Keep the lesson rail, paired Python workspace, and restrained citron action hierarchy consistent across roles.
- Display only confirmed state. `Saved` means server acknowledgement; `Passed` means a server verdict; `Published` means the publication transaction committed; `Connected` means an observed authenticated MCP request. Distinguish local recovery, queued work, running work, and infrastructure failure in both UI state and wording.
- Every visible action must work, navigate to a real destination, or clearly explain a legitimate unavailable state. Keep primary actions labeled and visible. Do not use hover-only controls, silent click handlers, fake uploads, simulated grading, fabricated queue positions, or optimistic success for irreversible actions.
- Preserve form text, author edits, and student code through retries, offline periods, conflicts, and responsive changes. Keep editor models stable across renders and pane resizes. Resolve conflicting revisions explicitly. Before sign-out with unsynchronized work, offer synchronization or explicit discard, then clear account-scoped local code.
- Match the design's dark/light/system tokens, typography, breakpoints, copy, state patterns, and motion rules. Support promised mobile reading, enrollment, theory, video, quiz, and progress. On compact devices, keep Python statements and synchronized code readable with desktop guidance and navigation; do not render a tiny fake IDE.
- Use semantic HTML, landmarks, heading order, visible focus, keyboard-operable tree/splitters/dialogs/editor, screen-reader status, text alternatives, reduced motion, forced colors, 200% zoom, and 320 CSS px reflow. Meet WCAG 2.2 AA and verify with keyboard and screen-reader use, not screenshots alone.
- Keep secrets, code, answers, personal data, and invitation/recovery tokens out of URL parameters, analytics, diagnostic attributes, and browser storage except the specifically allowed account-scoped recovery data. One-time MCP secrets may live only in short-lived in-memory reveal state.
- Use truthful, concise English labels from the design. Do not claim work is saved when only an attempt snapshot is stored. Do not expose answer keys before quiz success, show hidden-test details, or count later failed practice as loss of completion.

## Completion and task status

- For each task, verify the affected API permissions, happy path, adverse states, and relevant AC/MCP scenarios. Check the appropriate P01–P45 view and shared design requirements. Use the visual checkpoints and viewport sizes in design Section 17 for UI work.
- Run the Phase A, B, C, and MCP gates stated in the PRD and `tasks.json` before claiming a release stage is complete. Record pilot load, restore, isolation, accessibility, and privacy evidence where required.
- Change a task to `done` only after implementation and meaningful verification. Keep incomplete work `in_progress` or `blocked` with the actual blocker. Update stage and module status consistently. A mockup, draft code, or passing screenshot alone is not completion.
