# App functional audit and repairs

Date: 2026-10-04. Target: ZUR workspace and local app. Three agents were assigned learner, authoring, and other-feature audits using the requested GPT-6 Luna low configuration. The primary agent inspected defects, implemented repairs, reviewed screenshots, and reran verification.

## Outcome

The inability to run code on narrow screens was a real product restriction: the editor became read-only below 1024 CSS pixels and execution actions were hidden. The custom-run button initially opened a tab rather than executing, and changing tabs discarded standard input. These restrictions are removed. Learners can edit, run samples, run their own code with optional input, inspect output, and then submit. Browser evidence includes actual editor typing, autosave, sample input 5 producing 10, and custom input 21 producing 42 through Ctrl+Enter, without creating a submission or marking the exercise complete.

The audit also found visible authoring controls with no handlers, missing structure deletion controls, and invalid preview links. Those defects were repaired and are covered by the extended browser journey.

## Repairs made

- Enabled Python editing, running, submission, reset, and attempt restore at compact widths; execution controls wrap within the viewport.
- Made **Run code** execute on its first click, preserve optional input across tab changes and runs, and keep retries in the selected execution mode. Prevented overlapping execution requests from competing for the results area.
- Reduced redundant instructional messages and oversized workspace headings; preserved task requirements, hints, output, and errors.
- Connected the Outline button and populated the Python outline with the enrollment's actual steps and progress. Compact outlines open within the viewport.
- Set lesson-specific browser titles for Python and reading lessons.
- Connected course archive, restore, and draft deletion to authenticated API requests. Added an archive-state Restore action and restricted draft deletion to eligible unpublished drafts.
- Applied author course status and search query filters to the rendered list.
- Added lesson rename and module, lesson, and step deletion controls with confirmation. Existing published-version content remains governed by the backend lifecycle rules.
- Fixed step preview links to the registered preview route and removed duplicated module-number prefixes.
- Corrected the browser journey's case-sensitive completion assertion and extended the journey to cover the repaired CRUD controls.

## Verification and evidence

| Check | Result |
|---|---|
| Production build | Passed. Vite reports a large main JavaScript chunk (about 981 kB before gzip). |
| Full automated suite | 542 passed / 555 total; 13 failed. Every observed failure is an ENOENT for missing historical screenshot evidence. The suite is **not green**. |
| Focused workspace/shell/responsive tests | 32 passed. |
| Focused author-page and lifecycle tests | 15 passed. |
| Learner real-browser probe | Visible editor replacement and autosave, samples, custom stdin/output, keyboard run, navigation, attempts, responsive controls, and mobile restore affordance verified. |
| Author browser journey | Disposable database, course/step authoring, publication, enrollment, completion, and extended CRUD controls. Detailed outcomes and limits are in the author report. |
| MCP and token browser journey | Passed (exit 0): real SDK client, token issuance/replacement/revocation, all step types, media upload, agent activity/recovery, validation-gated publication, and idempotency. |
| Supplemental public/admin browser journey | Passed (exit 0), six journeys: multilingual catalog and mobile filters, 5-minute internal-error telemetry, report-to-exact-version inspection, unavailable snapshots, and responsive admin pages. Screenshots: `screenshots/app-audit-s4/`. |
| Other-feature browser audit | Auth, public pages, profile/appearance saves, password change and restoration with fresh sign-ins, data export, token issue/revoke, category create/edit/delete, role boundaries, admin routes, and responsiveness passed. Detailed limits are in the features report. |

See [MCP browser summary](evidence/app-audit-mcp-browser-summary.json) for the additional journey and screenshot paths.

See [automated test summary](evidence/app-audit-test-summary.json) for all 13 failed checks and their missing paths. Historical screenshots were not fabricated or replaced with unrelated captures.

## Detailed agent reports

- [Learner and execution report](LEARNER_BROWSER_AUDIT.md)
- [Course and lesson CRUD report](AUTHOR_BROWSER_AUDIT.md)
- [Auth, settings, admin, and other features report](FEATURES_BROWSER_AUDIT.md)

Browser interaction used real Chrome through the Chrome DevTools Protocol because a native computer-use tool was not available in this session. Checks included DOM controls, keyboard input, rendered output, screenshots, and real HTTP services. Destructive lifecycle tests used disposable databases. An early learner experiment changed the shared seeded draft; the agent restored its original code and used an isolated fixture for final typing/submission checks.

## Remaining issues and coverage limits

This audit records tested behavior; it does not certify every possible feature, role, error condition, or external integration. The separate reports distinguish page rendering, actual UI mutations, fixture setup, and direct API probes.

- Course structure reordering has service methods but no author HTTP route or UI controls; it remains unavailable through the browser.
- The 13 historical screenshot evidence checks remain failed until their real captures are regenerated.
- The main application bundle remains large.
- Attempt-detail browser titles remain generic. Runtime tracebacks expose internal runner paths in the learner error display.
- External email delivery, provider video playback, and other integrations are subject to the limits recorded in the individual reports.
- The workspace usability fixes are verified; pixel-level similarity across the whole app to Stepik was not established by this audit.
