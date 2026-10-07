# Author plan

Analysis only, commit `0998ec0`, 2026-10-06. All changes **Proposed**. Reviewed after saving the learner plan and inventory, before inspecting admin screenshots. Selected earlier recommendations: preserve work during failures, meaningful author progression, actionable validation, truthful preview, stable navigation. Evidence: [35-frame manifest](author-manifest.json), [coverage](author-coverage.md), [independent live checks](codex-author-live.json). Disposable data only; no course published.

## A1 — Preserve course title after failed creation

**P1, confirmed defect.** `/teach`, new-course dialog: controlled create-endpoint 503 clears “Fixture title to retain” to an empty input. Normal dashboard screenshots provide context; the failed dialog still needs a screenshot. Retain entered fields and focus through validation/network errors, show actionable inline feedback, prevent duplicate submissions, close only on acknowledged success. Change the creation state/renderer in `AuthorCoursesPage.ts`; retain existing dashboard/cards.

Acceptance: submit a populated form under 503, validation rejection and retry; text survives, retry creates exactly one disposable course and the acknowledged destination is correct. Required after screenshots: populated failure and successful receipt in both themes at 1440×900. Depends on shared modal lifecycle S2.

## A2 — Preserve search across status changes

**P2, confirmed defect.** `/teach?search=Python` → Drafts becomes `/teach?status=draft`, with empty search input. Compose validated `search` and `status` parameters rather than replacing the query; clear only through an explicit reset. Retain tabs, count badges and cards. Change filter URL builders in `AuthorCoursesPage.ts`.

Acceptance: search → Drafts → All → Back/Forward/reload retains the intended combined query and matching results; invalid status uses the default. Required after screenshots: combined filters, empty result and cleared state in both themes. Depends on shared query/history conventions S3.

## A3 — Give the dashboard one main landmark

**P1, confirmed DOM defect.** `/teach` has two `main` elements and two `main-content` IDs. Keep `AppShell` as landmark owner; render the page's inner container as a labelled section or div in `AuthorCoursesPage.ts`. Visual layout stays intact. Screen-reader impact has not been tested and no formal accessibility conformance judgment is made.

Acceptance: exactly one main and one skip-target ID; keyboard skip link lands inside the page content. Required after screenshots: both themes with accompanying DOM/keyboard evidence.

## A4 — Reuse current problem/code presentation in read-only preview

**P2, design judgment.** Python preview retains a filename header and old disabled Run samples/Submit solution toolbar while learner execution uses the current split workspace. Fresh dark preview and independent DOM checks confirm the difference. Preview is correctly labelled and Back to Editor has the correct destination.

Reuse the learner problem/code presentation through a deliberate read-only mode in `AuthorStudentPreviewPage.ts` and shared workspace components. Replace redundant inactive execution toolbar with a concise preview explanation; preserve curriculum, problem, hints, public tests, current code and Back to Editor. Do not enable grading or simulate a learner success. Depends on shared presentation S4.

Acceptance: preview every step type, including Python in both themes and at narrow desktop width; correct editor return, no mutation/grading requests and no misleading primary action. Required after screenshots: Python split and preview notice, theory/video/quiz and editor return.

## A5 — Keep author exits on load failure

**P1, confirmed under controlled 503.** Courses exit from an editor eventually displays generic retry-only failure without workspace/application exits. During the sampled pending request the old author header remained; disappearance during loading is not established. Apply shared S1 to the author loader: keep safe Courses/application navigation around error content and retry. Retain publication validation groups and useful step/test deep links.

Acceptance: loading, 403/404 and 5xx list/editor failure preserve safe exits and retry, disclose no forbidden course data, recover successfully and retain supported drafts. Required after screenshots: each failure category, both themes. No publication is required for validation.

## Limits

The capture log mostly proves rendered states, not a complete create/edit/save/preview/validate journey. Save conflicts, dirty browser navigation, keyboard tree interaction, real uploads, publish receipts, token lifecycle and restore conflicts remain unverified. Existing click-to-save guards in author editors must be preserved and tested before proposing a replacement. A successful-looking seeded publication checklist does not prove a production runner or publication succeeds.

Principle mapping: A1/A2 preserve work and context (13); A3 preserves accessible navigation (15); A4 shares truthful workspace presentation (4, 7); A5 retains safe exits and complete journeys (12, 17).

## A6 — Remove routine save status and repeated release instructions

**P2, design judgment; principles 1, 2, 11, 16; Proposed.** `/teach/:courseId/content`, course editor/settings headers and `/teach/:courseId/publish`: clean builder/video/quiz/settings screenshots show Saved; publication dark/light repeats readiness in Next action, the checklist and Publish Version 3. Source confirms the builder defaults saveStatusText to Saved and the publication renderer repeats the checklist result.

Suppress routine successful-save text in `AuthorWorkspaceShell` callers; retain visible dirty Save, pending state when it prevents an action, failures and conflict recovery. On publication keep one validation summary with actionable blockers/warnings, the release-impact panel and primary publish control; remove the duplicate ready-state Next action sentence that repeats its label. Retain extra guidance when blocked if it provides a useful next step. This reduces repeated scanning while preserving decisions; no validation/publish behavior changes. Depends on existing save-state contract, after A1/A5 recovery.

Acceptance: clean headers are quiet; dirty/pending/error/conflict remain distinguishable and recoverable; ready publication states show readiness once alongside impact and one primary publish action; blocking issues remain deep-linked and cannot be bypassed. Required after captures: clean/dirty/save failure headers and ready/blocked publication in both themes. Do not publish a course for this review.

## A7 — Keep connection setup focused on connection decisions

**P2, design judgment; principles 1, 16; Proposed.** `/settings/ai-connections/:connectionId/setup`, both normal/full-page themes: the endpoint section includes internal PRD section references and repeats transport/version details before the configuration. Current screenshots contain SDK TypeScript, not the originally claimed Claude/Cursor JSON guides.

Remove internal PRD references from `pages/settings/McpClientSetupDialog.ts` (`renderMcpClientSetupPage`, loaded by `renderAiConnectionSetupPage` in `main.ts`), combine repeated transport wording, and place upload/batch limits in a labelled expandable Technical limits section. Retain compatible-client choices, relevant version/transport requirements, endpoint, copy configuration, safe credential handling, scope, waiting/verified/error status and verification instructions. Technical details needed to connect remain available. This shortens the setup path without deleting configuration or changing credential behavior. Independent of other changes; implement after recovery work.

Acceptance: users can choose a compatible client, copy correct endpoint/configuration, supply their own token safely and verify actual connection; advanced limits remain keyboard accessible; unsupported client/error/expired states explain recovery. Required after captures: expanded/collapsed limits, waiting/verified/error, both themes and narrow desktop; clipboard/live handshake evidence still required.

## Batch recheck against all 17 principles — 2026-10-08

All 35 author PNGs reinspected after learner plan/coverage were saved, before opening admin images. A1–A5 retain their earlier independent live evidence; screenshots alone do not prove title-loss/error recovery. A6/A7 are bounded design judgments. Builder horizontal scrolling is visible even in the short fixture; exact overflow cause and long-tree keyboard behavior remain unresolved, not an invented confirmed regression.

1/2/16: A6/A7 reduce repeated status/internal wording; retain primary task actions and authored educational content. 3/5/12: contextual author shell/exits retained; A5 addresses failure, long tree and scroll stability unverified. 4/6/7/8: A4 aligns read-only learner preview while preserving split/task/curriculum; no grading controls enabled, editor shortcuts/caret/contrast require live evidence. 9/10: answer-key selection visibly differs from learner answers; checklist readiness is fixture-only. 11/13: A1/A2 preserve work/query and A6 quiets routine save text while retaining recovery. 14: reduced motion/remount/flicker unverified. 15: A3 removes duplicate main IDs; screen-reader/keyboard tree/modal coverage incomplete. 17: full authoring/save/preview/validation and connection handshakes remain unverified; no publication occurred.
