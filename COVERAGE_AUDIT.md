# `tasks.json` coverage audit

Reviewed the complete current [PRD_V2.md](PRD_V2.md) (663 lines), [design.md](design.md) (913 lines), and [tasks.json](tasks.json). This audit concerns **planning coverage**, not implemented product functionality.

## Measurable coverage

An item counts as mapped when `tasks.json` has a relevant task and an explicit page/acceptance mapping. This checks traceability at the specifications' named-checkpoint level; it does not certify that every sentence is restated in a task description.

| Named checkpoint | Mapped | Total | Coverage |
|---|---:|---:|---:|
| Design page/view IDs P01–P45 | 45 | 45 | 100% |
| PRD end-to-end criteria AC-01–AC-20 | 20 | 20 | 100% |
| PRD MCP criteria MCP-01–MCP-12 | 12 | 12 | 100% |
| **Combined named checkpoints** | **77** | **77** | **100%** |

The file contains 7 stages, 17 modules, and 99 unique tasks. Ninety-three P0 tasks are `not_started`; six later-scope tasks are `deferred`. The 100% figure means every named checkpoint has a place in the plan. It does **not** mean the backlog is a self-contained transcription of all PRD/design rules, or that any product feature is implemented.

## Requirement detail still implicit or absent from task descriptions

These are examples found by rereading the full specifications. Implementers must consult the source documents, as required by [RULES.md](RULES.md), rather than treating a task's short description as the complete contract.

| Source | Detail | Current task coverage |
|---|---|---|
| PRD §3 | Primary weekly metric: unique learners passing a required assessment, tracked with practice frequency and course completion. | T076/T092 cover events and pilot measures but do not name this primary metric. |
| PRD §5 | Tags are length-limited as well as trimmed, normalized, and deduplicated. | T030 mentions normalized tags and the five-tag limit, but not the length rule. |
| PRD §7.3 | Shareable invite default maximum of 30 days and copy-link fallback after email failure. | T046 covers expiry, link management, and delivery failure, but these two exact behaviors are implicit. |
| PRD §10 | A lesson or module with no required descendants is labeled `Optional`. | T047/T049 cover required and optional progress but omit this exact display rule. |
| PRD §12.2, §12.5 | Comparator's final empty-line removal and exact terminal verdict set. | T019/T021 describe comparator and result lifecycle in summary form without enumerating these cases. |
| PRD §13 | Exact numeric runner budgets and rate ceilings. | T020/T024 require limits and quotas but do not copy their values; the PRD table remains authoritative. |
| PRD §17 | Consistent timestamp storage and display in the user's local timezone. | No task states the timezone rule explicitly. |
| PRD §23.4 | MCP read-only/destructive tool annotations and bounded structured schemas. | T057–T064 cover protocol, tools, and enforcement, but do not explicitly mention annotations. |
| design §14 | Pending-work sign-out offers sync or explicit discard before local cache clearing. | T014/T025 cover sign-out and cache clearing, but not the full transition. |
| design §17 | Exact representative fixture set, including old-version enrollment, waiver, hidden failure, and suspended course. | T005/T087 require deterministic fixtures and visual checks, but omit the full fixture inventory. |

**Assessment:** `tasks.json` has **100% named-checkpoint coverage (77/77)** and broad coverage of the product areas. A precise percentage for every individual sentence-level requirement would need a separately defined atomic requirement inventory; claiming one from these high-level task descriptions would give false precision. The details above prevent interpreting the 100% traceability figure as complete textual coverage.
