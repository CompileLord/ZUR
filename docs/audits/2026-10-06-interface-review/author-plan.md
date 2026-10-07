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
