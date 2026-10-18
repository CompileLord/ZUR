# Admin interface plan

## Implementation status

Status: **Core changes implemented and locally audited — full specification partially complete** (2026-10-06). Executor: agy `gemini-3.8-flash-high`, admin scope. Track page-level completion, checks, and screenshot evidence in [implementation report](2026-10-06-redesign-implementation/admin/REPORT.md). Independent review, completed checks and remaining requirements are recorded in [Codex audit](2026-10-06-redesign-implementation/AUDIT.md). Agent self-check alone does not mark the plan complete.

This extends the [shared redesign plan](2026-10-06-interface-redesign-plan.md) using ten reviewed admin page states: eight viewport captures and the two full-page user/course detail captures. See the [admin evidence](2026-10-06-desktop-design-review/INDEX.md#admin). Report and audit detail were not captured. Empty report/media/audit tables do not establish the quality of populated states or action dialogs.

## Direction and priorities

Keep the existing persistent admin sidebar and table-oriented structure. The largest change belongs on user detail: four simultaneous grant/revoke/suspend/restore forms, plus a support-access form, each repeat target, reason, and password. Course detail similarly foregrounds long action forms. Convert these into clear entity summaries with deliberate action entry points and one focused confirmation at a time.

**P0:** user/course action hierarchy and trustworthy operational status. **P1:** consistent list/detail navigation, execution feedback, and report triage. **P2:** category/media/audit polish. Priority is local to the admin workstream; the master learning workspace remains the overall first delivery.

Use the shared 56px header, approximately 224–248px sidebar, 32–40px content gutter, and 44–52px table rows where content permits. Keep table headings visible during long scrolling. Use shared type, colors, buttons, focus states, and dialogs. Dense operations screens can share the product's identity without copying the learner's task layout.

## Page changes

| Page and evidence | Observed issue / retain | Planned change and acceptance |
|---|---|---|
| **P32 Overview — 01** | Execution repeats “Available” in badge and large text. Six large cards mix current health, missing telemetry, and empty data. “Email delivery: Normal” appears beside “No delivery data.” | Use a compact attention section followed by health summaries. Distinguish “Accepting jobs” from proven worker health. Unknown telemetry and no delivery data must remain unknown, not green healthy. Show refresh time once globally and stale state per source when necessary. Each actionable problem links to its detail. Preserve useful links already present. |
| **P33 Users list — 02** | Table is readable and compact; a purpose paragraph and “Users and capabilities” title add text. The unlabeled “All” filter is ambiguous. | Title “Users”; remove the subtitle. Label filters by meaning, e.g. Account state or Role as supported. Make names clearly keyboard-accessible links; keep verification, roles, account state, and dates. Preserve search/filter/page position on return. Avoid adding new columns unless they support a frequent task. |
| **P33 User detail — 03 full** | Grant author, Revoke author, Suspend, and Restore appear together as equally prominent primary forms even for an active student. A fifth form starts support access. | Show identity, verification, roles, and state first. Use actions such as “Manage roles,” “Suspend account,” and “Open support access.” Reflect current state: restoration is relevant to suspended accounts; role controls display held roles. Each selected action opens one dialog with the named user, before/after effect, reason, and required reauthentication. Keep the raw ID copyable in details. Return to the same section with updated state and audit link. |
| **P34 Courses list — 04** | Existing columns distinguish publication, visibility, and availability; these meanings are valuable. Introductory text repeats them. | Keep the distinctions, shorten the heading to “Courses,” and remove the paragraph. Add status/availability filtering if supported or explicitly implement it. Use named course links, compact version display, and open-report counts linked to filtered reports. Preserve list state. |
| **P34 Course detail — 05 full** | “Immutable published releases,” raw snapshot IDs, ISO timestamps, and always-open suspension/waiver forms make the page dense. | Use summary → Published versions → Reports/affected steps. Label versions by number and readable date; IDs remain in expandable copyable details. “Change availability” and “Waive step” open focused flows. Waiver flow selects version/step, previews content and affected enrollment count, then confirms reason/authentication. Keep the warning that waiving differs from passing. Recheck affected scope server-side before commit. |
| **P35 Categories — 06** | New category and Edit are already clear. The subtitle mostly repeats purpose and warns about confirmation before any action is chosen. | Keep the table and controls; remove the subtitle. Show usage as a link if course filtering exists. Keep any removal consequence inside Edit/Delete. Do not add drag reorder unless ordering has product meaning and backend support. Handle empty, duplicate-name, and in-use states next to the field/action. |
| **P36 Reports list — 07** | Status tabs already exist. Empty table plus “Showing 0–0 of 0” duplicates emptiness. | Keep tabs; optionally default the triage entry point to Open while preserving explicit URL selection. Show a single state: “No open reports” or “No reports match these filters,” with Clear filters only when relevant. Hide empty pagination counts. Populated rows should prioritize course/step, type, age, and status; verify this with populated evidence before finalizing widths. |
| **P36 Report detail — not captured** | Proposal, not a visual finding. | Description and reported course/version/step first; authorized code/attempt context in a secondary panel. Provide one resolution/status action with necessary notes. Preserve filtered-list return state and distinguish successful resolution from an error. No bulk moderation in this pass. |
| **P37 Media — 08** | Empty table is preceded by implementation wording about authorized quarantine and raw binaries. | Title “Media”; remove the paragraph and redundant zero-result footer. Keep an honest empty state. For populated data, show course, asset type/size, processing state, reference count, and Review. Existing safe-preview and quarantine controls must remain; their dialogs were not captured. No decorative thumbnails for content that has not been cleared for display. |
| **P38 Execution — 09** | The isolated destructive control is useful. Queue cards repeat labels in captions; missing worker health sits beside “Execution: Enabled.” Job rows all show “Completed,” without visible verdict. | Label admission state “Accepting jobs” and worker telemetry separately. Retain the focused pause/resume confirmation; shorten button to “Pause new runs…” if this matches actual behavior. Separate job lifecycle from result: a completed job may contain an execution error or failed submission. Add result/detail inspection only using actual API verdicts. Keep references copyable; show course/step context if available. Retain date filters and label the displayed timezone. |
| **P39 Audit list — 10** | Advanced filters are already collapsed. Primary action search expects a technical action name; an empty table retains a zero-result count. | Remove the “authoritative immutable log” subtitle. Offer friendly action choices mapped to existing action codes, retaining raw-code input in advanced filters. Keep reason search. Move correlation IDs into detail unless support workflows require them in the list. Show one honest empty/no-match state. Preserve exact evidence and server-side pagination. |
| **P39 Audit detail — not captured** | Proposal, not a visual finding. | Present actor → action → target → outcome/reason/time, then expandable structured changes and copyable IDs. Preserve the original event data, permission limits, and return filters. |

## One action confirmation pattern

```text
Suspend Ada Lovelace
Current state: Active → Suspended
Effect: [accurate action-specific consequence]
Reason             [                                  ]
Admin password     [                                  ]
                                      Cancel   Suspend account
```

Use the actual human-readable entity as the heading. Show a different effect for account suspension, author-role changes, course availability, support access, and waivers. Do not make everything a generic “Confirm action.” Display only relevant controls; keep server-side capability, scope, and reauthentication checks.

On submission, prevent duplicate requests and show progress in the dialog. On success, update the entity state and provide a concise receipt/audit link. On recoverable failure, retain non-sensitive fields such as reason and selected target; do not persist or echo passwords. Where rate limits exist, show server-provided retry timing. Close returns keyboard focus to the original action. Destructive actions use danger styling rather than the same citron treatment as benign actions.

## Copy and motion

Remove generic list introductions, repeated “Target / Proposed action” blocks on the resting page, and redundant zero-count footers. Rename “Capabilities” to “Roles” only where the displayed values truly are roles; keep precise permission terminology when needed. “Published versions” can replace “Immutable published releases,” with the immutability explanation available on inspection. Keep effects and audit reasons where they support a decision.

Use 120ms row/button feedback and a 160–180ms dialog transition. Keep the shell and filtered list mounted while opening details where practical; refresh only the affected row after an action. Never animate an entire table on polling or silently remove a focused row without relocating focus. Honor reduced motion.

## Delivery and verification

1. Extract/reuse a shared action-dialog pattern from existing working dialogs in `AdminPages.ts`; migrate user and course actions first. Keep `AdminShell.ts` navigation.
2. Consolidate list headers, filters, table empty states, and detail return state. Share components with author management lists where useful.
3. Refine overview/execution status language and model unknown, stale, completed, passed, failed, and infrastructure-error states separately. Changes may require explicit API fields; do not infer missing state from a green badge.
4. Apply category, media, audit, and copy refinements. Inspect currently uncaptured dialogs and populated states during implementation.

Acceptance journey: filter list → inspect entity → choose one action → review target/effect → confirm → see updated state/audit evidence → return to the same filtered list. Test normal, unavailable, stale, denied, rate-limited, and failed-action states; keyboard/focus recovery; long names/IDs; both themes. Static screenshots do not verify actual permissions or mutations. Use isolated test fixtures for action verification and desktop captures.
