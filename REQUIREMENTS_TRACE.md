# Requirements trace

This is the implementation index for [PRD_V2.md](PRD_V2.md), [design.md](design.md), and [tasks.json](tasks.json). A task ID identifies planned work; it is not proof of implementation. The `acceptance_coverage` object in `tasks.json` maps AC-01–AC-20 and MCP-01–MCP-12 to tasks. Each module's `coverage` array maps design P01–P45 to tasks. Implementation evidence is added when a task is verified and marked `done`.

| PRD section | Implementation tasks | Planned verification |
|---|---|---|
| 1 Product definition | T052, T092 | Phase B vertical slice and pilot author/student journeys |
| 2 Users and outcomes | T048, T052, T073–T075, T092 | Teacher publication, learner practice/resume, operator support journeys |
| 3 Goals and measures | T076, T089, T092 | KPI definitions, sample/window exclusions, pilot measurement report |
| 4 Release scope | T001, T093–T099 | P0 gate review; deferred features remain outside release |
| 5 Domain model | T006, T030–T031, T040, T047 | Hierarchy/identity/category/tag constraints and progress tests |
| 6 Accounts and permissions | T007, T013–T018, T078, T086 | Authorization matrix, AC-05, authentication/accessibility checks |
| 7 Publication, visibility, enrollment | T043–T046, T070–T073 | Discovery and access matrix; AC-06, AC-07, AC-16 |
| 8 Authoring and publishing | T029–T041 | Builder, autosave, preview, validation; AC-01–AC-03, AC-18 |
| 9 Course versions | T041–T043, T079 | Pinned-version and waiver tests; AC-04, AC-19 |
| 10 Learning and completion | T047–T051 | Required/optional progress and resume tests; AC-12, AC-15 |
| 11 Content and quizzes | T032–T036, T050–T051 | Media/quiz rendering, answer privacy, passing behavior |
| 12 Python exercises | T019–T028, T037 | Comparator, run/submit, drafts, hints/history; AC-08–AC-13 |
| 13 Execution safety | T020–T024, T028, T083, T089 | Isolation and capacity review; AC-13, AC-14 |
| 14 Teacher analytics | T073–T076 | Metric query/denominator tests and owner-only views |
| 15 Administration and privacy | T002, T004, T077–T085 | Audited support, report, retention/deletion; AC-19, AC-20 |
| 16 UX and accessibility | T008–T012, T026, T086–T087 | Keyboard/screen reader, contrast, responsive checkpoints; AC-17 |
| 17 System boundaries and data | T005–T007, T019–T025, T041–T042, T057–T064 | Migration, transaction, worker, authorization, and integration checks |
| 18 Reliability and operations | T021, T024, T077, T083, T088–T089 | Load, alert, backup, restore, rollback, recovery evidence |
| 19 Acceptance criteria | T090 | AC-01–AC-20 evidence matrix |
| 20 Delivery gates | T028, T052, T068, T089–T093 | Phase A/B/C and MCP gate evidence |
| 21 Changes from V1 | T001, T090 | Confirm V2 rules in acceptance matrix; contextual history, not a separate feature |
| 22 Open decisions | T002–T004, T093 | Named decision owners, architecture records, launch sign-off |
| 23 MCP authoring | T053–T068 | Real SDK workflow and MCP-01–MCP-12 |

## Evidence rule

For every completed task, record the code/artifact paths and the relevant automated or manual verification in the task's completion record. Do not use this planning trace or a UI mockup as evidence of a working product.
