# S5 controlled pilot and release-gate audit

Audit date: 2026-09-28. This is a repository audit, not pilot or launch approval. Sources: PRD_V2.md sections 3, 18–20, 22–23; design.md sections 16–19; rules_strictly.md; tasks.json S5.

## Reproducible checks

| Check | Result | Interpretation |
|---|---|---|
| npm test | 540 passed, 0 failed, 540 total | Local automated suite is green across all packages, including AC-01–AC-20 and MCP-01–MCP-12 tests. This does not establish deployed acceptance or pilot results. |
| npm run build | Passed | Vite warned about an 904.05 kB minified JavaScript chunk, 243.96 kB gzip. Page performance remains unmeasured. |
| Route inventory | P01–P45 declared in packages/web/src/router/routes.ts | Route declarations and unit tests do not prove every browser workflow. |
| Accessibility | Automated AX, keyboard, and contrast evidence in docs/evidence/S4-M04-verification.md | Human screen-reader and native forced-colors review are absent. |
| Operations | docs/operations/production-readiness.md | Production-like load, external alerts, restore, and rollback drills are absent. |

The earlier 526/13 run reflected screenshot files removed on 2026-09-28. Full workspace access allowed the local Chrome capture scripts to run. The repository now has 556 generated PNG files. The live browser journey used a separate local execution worker against disposable SQLite fixtures; the worker exposed a SQLite lock under concurrent API activity, so connections now wait up to five seconds for a lock. The interactive harness was corrected to use canonical learning routes, inspect the visible CodeMirror surface, expect queued HTTP 202 responses, and accept a reachable token-dialog action whether or not its inner panel needs scrolling. The P12/P13 capture verified authorized media and a blocked-video recovery path. The full suite and build passed on 2026-09-29; `git diff --check` passed.

The code audit found stale Python 3.12 labels on the landing example, preview, and fallback workspace while the pinned runner uses Python 3.14.7. These labels, the learning workspace label, and attempt metadata now use one shared Python 3.14.7 label. Browser screenshots show the updated label.

Genuine browser screenshots were visually reviewed for P01 at actual 200% Chrome zoom, P13 mobile transcript, P15 desktop passing submission, P22 builder overview with contextual inspector, P34 operations, and P43 token reauthentication at actual 200% zoom. The P22 live route now includes the contextual inspector required by design.md §5 and §12, verified in both dark and light themes (`s4_t087_p22_live_builder_overview_1440x900_dark.png` and `s4_t087_p22_live_builder_overview_1440x900_light.png`) with `gateOpen: false` in `s4-m04-interactive-browser-flows.json`. The P43 dialog action is visible at 200% zoom, although the underlying form content needs internal scrolling and merits further keyboard review. T087 and T091 remain open.

## T090: AC-01–AC-20 acceptance matrix

The following files contain relevant local tests. Every item still needs its full PRD end-to-end result; local tests alone do not pass the Phase C gate. The final column identifies the most material missing verification.

| ID | Existing evidence | Remaining verification |
|---|---|---|
| AC-01 | course-authoring.test.ts; auth-and-pagination.test.ts | Browser create and cross-account private-ID check. |
| AC-02 | draft-save-queue.test.ts; course-authoring.test.ts | Real disconnect, reconnect, and concurrent browser edit. |
| AC-03 | author-validation-quota.test.ts; publication-and-lifecycle.test.ts | Linked browser errors for failing reference and absent hidden test. |
| AC-04 | publication-and-lifecycle.test.ts; learning-publishing-route-integration.test.ts | Joined learner before/after publish with pinned tests and progress. |
| AC-05 | auth-and-pagination.test.ts; catalog-and-overview.test.ts; quiz-and-media.test.ts | Exhaustive API and asset cross-account adversarial matrix. |
| AC-06 | invitations.test.ts; auth-pages.test.ts | Browser recovery for expired, revoked, exhausted, wrong-email invitations. |
| AC-07 | enrollment-and-progress.test.ts; enrollment-endpoints.test.ts | Revoked learner attempts open join through live route. |
| AC-08 | execution-boundary.test.ts | Live Run result with unchanged progress. |
| AC-09 | execution-boundary.test.ts | Duplicate HTTP request and completion transaction. |
| AC-10 | execution-boundary.test.ts; auth-and-pagination.test.ts; workspace-pages.test.ts | Inspect all student HTTP, logs, downloads, and browser events after echo attack. |
| AC-11 | quotas-and-drafts.test.ts; workspace-pages.test.ts | Cross-device restore of acknowledged revision. |
| AC-12 | execution-boundary.test.ts | Live prior pass then failed submit with latest verdict and retained completion. |
| AC-13 | execution-boundary.test.ts; worker runner tests | Production-like crash and lease recovery; T028. |
| AC-14 | runner.test.ts; execution-boundary.test.ts | Reviewed deployed isolation against malicious code; T028. |
| AC-15 | enrollment-and-progress.test.ts | Browser optional-step progress check. |
| AC-16 | publication-and-lifecycle.test.ts; admin-operations.test.ts | Live archive and suspension access check. |
| AC-17 | s4-m04-a11y-smoke.json; responsive-accessibility.test.ts | Human screen-reader and native forced-colors core journeys; T086. |
| AC-18 | teacher-roster-analytics.test.ts; author-pages.test.ts | Live preview/test without learning counters changing. |
| AC-19 | admin-operations.test.ts; waiver preview evidence | Live scoped waiver, audit, and metric check. |
| AC-20 | deletion-restore.test.ts; POLICY-retention-and-ownership.md | Independent durable registry and staging backup restore before traffic; T004/T088. |

The named MCP-01–MCP-12 cases in packages/server/tests/mcp-adversarial-and-e2e.test.ts passed in this local run. Grouped release gaps:

| ID | Local test coverage | Remaining release evidence |
|---|---|---|
| MCP-01 | Token scope and course restriction | Real compatible SDK client discovery and course-limited read. |
| MCP-02 | Agent hierarchy creation | Builder edit of all created step types in real client workflow. |
| MCP-03 | Image and Markdown round trip | Uploaded image delivered to authorized student in real client workflow. |
| MCP-04 | Revocation before commit | Deployed pending-write cancellation under live transport. |
| MCP-05 | Cross-author denial | Deployed parent/course/asset ID adversarial requests. |
| MCP-06 | Draft-only scope | Deployed publish/delete/access-change denials. |
| MCP-07 | Scoped publish | Real full-control client publish with validated revision. |
| MCP-08 | Stale batch and idempotency | Concurrent builder/client edit and receipt retry. |
| MCP-09 | Unsafe import rejection | Deployed media and Markdown boundary. |
| MCP-10 | Draft recovery | Real UI recovery with published/enrolled version unchanged. |
| MCP-11 | Reference validation | Real runner-backed invalid Python publish denial. |
| MCP-12 | OAuth-only limitation | Browser wording review after screenshot recapture. |

PRD section 23.9 also requires one real SDK client workflow creating Markdown, an uploaded image, a quiz, and a validated Python exercise, then editing concurrently with the builder and publishing with a scoped token. A local test scenario cannot substitute for that deployed workflow.

## T091: page, shell, and state inventory

All 45 page IDs and S1–S6 shells are registered in packages/web/src/router/routes.ts and have implementation/test families below. This is code presence, not visual acceptance.

| Pages | Source and test family | Open gap |
|---|---|---|
| P01–P03, P40–P42 | pages/public, pages/status, public-pages.test.ts | P41 policies need approval (T072); current screenshots cover selected routes and states. |
| P04–P08, P17–P20 | pages/account, pages/settings, auth-pages.test.ts | T013–T018 authentication/provider/access checks remain. |
| P09–P16 | pages/learning, learning-pages.test.ts, workspace-pages.test.ts | T026/T028 and authenticated adverse-state visual checks remain. |
| P21–P31 | pages/author, author-pages.test.ts, publish-page.test.ts, roster tests | Authenticated adverse-state visual matrix incomplete. |
| P32–P39 | pages/admin/AdminPages.ts, admin-pages.test.ts | Operational display does not prove alerts or recovery. |
| P43–P45 | AiConnectionsPage.ts, McpClientSetupDialog.ts, AgentActivityPage.ts and tests | Real client workflow, conflict capture and keyboard review remain. |

Shared states, shells, and controls have states.test.ts, shells.test.ts, and components.test.ts. Theme tokens have contrast.test.ts. Screenshots cover selected dark/light, 320–1440 px, and actual 200% zoom states, but not every design.md section 17 checkpoint branch or keyboard/focus combination. The P22 contextual inspector is now implemented on the live builder route and verified with live dark/light 1440x900 captures. Human screen-reader and native forced-colors review remain open under T086. T091 cannot pass until these gaps and dead-control review are resolved.

## T092: controlled pilot protocol and report

Prerequisites: approved adult-only audience and country enforcement, participant recruitment, working email verification, production-like isolated runner, named support, approved privacy/retention policy, monitoring, and recovery drills. Staff, previews, automation, fixture users, and test accounts are excluded from product measures. Store participant identifiers only in access-controlled systems; the aggregate report must avoid raw code and personal details.

Run separate invited-author and new-learner cohorts. Record invitation/enrollment and observation timestamps, timezone, prepared mixed-lesson content, eligibility, withdrawals, and exclusions. Authors publish a theory-plus-exercise lesson without staff database intervention. Learners enroll, submit, return, and practice again. Record first-lesson start/end times.

| Measure | Numerator / denominator | Window and target |
|---|---|---|
| Author activation | Eligible invited authors publishing a validated lesson / eligible invited authors | Seven days; at least 60%. |
| First-lesson time | Median elapsed minutes from prepared-content start to mixed-lesson publish | Usability sessions; at most 20 minutes. |
| Student activation | New eligible enrollments submitting an assessment / new eligible enrollments in courses with assessments | Seven days; at least 60%. |
| Week-two retention | Activated eligible learners submitting again days 7–13 / activated learners eligible for full observation | Days 7–13; at least 35%. |
| Grading reliability | Accepted submissions reaching a verdict without infrastructure failure / all accepted submissions | Pilot window; at least 99.5%. |
| Work preservation | Confirmed loss of server-acknowledged author content or learner code | Pilot window; zero incidents. |

Report raw numerators and denominators, cohort definitions, exclusions, dates, sample sizes, incidents, and target comparison. Week-two retention requires its full observation window. No real participant results are recorded in this repository today; T092 is blocked pending actual recruitment and operations.

## T093: security, privacy and launch decision

Decision: no pilot or public launch approval. These gates require closure and dated signoff:

| Gate | Evidence gap | Owner |
|---|---|---|
| Authorization, MCP and hidden data | Local adversarial tests pass; deployed cross-account/API/media/client checks remain. | Security lead |
| Runner safety | T028 in progress; production-like isolation review, crash and load evidence missing. | Engineering/security |
| Identity and audience | ADR-001 specifies adult-only countries; T013–T015 provider delivery and stronger admin authentication remain. | Product/security/privacy |
| Policy and deletion | T072 blocked, T004 in progress; approved legal text, independent registry and staging restore absent. | Product/privacy/engineering |
| Accessibility and visual completeness | T086 blocked and T087 in progress; screenshots and automated checks pass (P22 inspector implemented and captured), but remaining checkpoint branches, keyboard/focus coverage, and human assistive-technology review remain open. | Accessibility/product |
| Operations | T088/T089 blocked; separate worker, external alerts, backup/rollback/drain drills, 100 learners and 20 execution requests/s for five minutes absent. | Operations/engineering |
| Pilot | T092 lacks real participants and week-two results. | Product/operations |

A later approval record needs date, candidate commit and artifact digest, environment, evidence links, residual risks, explicit product/privacy/security/operations signoffs, scope (pilot or public), and rollback owner. A template is not approval.
