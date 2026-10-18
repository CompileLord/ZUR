# Accepted learner after-state coverage

Written before author starts. Exact image/state inventory is [all54 Round4 captures](round-4-visual-review.md), [two Round5 captures](round-5-visual-review.md), [108 retained image hashes](round-5-image-verification.json) and [manifest](../../learner/manifest.json). Original route inventory/unchanged page coverage remains in the reviewed learner plan and coverage; this repair batch does not recertify every unchanged route.

| Route family | Reviewed repair states | Decision / gaps |
| --- | --- | --- |
| /learn/courses | In progress/Completed/All, empty Completed, invalid query, history/reload | Accepted L1; current corrected dark/light frames. |
| /learn/:enrollmentId/steps/:stepId | Python/theory/video/quiz, sidebar expanded/collapsed/SPA/reload, report normal/503/keyboard, editor/results | Accepted sampled L3/L5/L8; video playback and production runner/grade unverified. |
| .../attempts | Real context, empty/populated/paged list | Accepted L2; own seed fixtures explicitly labeled. |
| .../attempts/:attemptId | Normal/long/narrow1100, restore confirmation/Cancel/reopen/503/actual ack, All attempts offset | Accepted L2/L4; Round5 supersedes unreadable Round4 restore failures. |
| /settings/profile | Dirty/Back cancel/confirmed discard/Forward/503/delayed success/storage denial | Accepted L6; corrected Round4 failures supersede old captures. |
| /courses/:courseId | Authenticated/anonymous unavailable, real service failures and retry | Accepted sampled L7; no complete permission matrix claim. |
| Shared learner navigation | Toggle location, account/enrollment/version storage scope, module expansion and Attempts return | Accepted sampled structure/context; long curriculum scroll/version migration not fully exercised. |

Every changed state was reviewed in both themes; narrower desktop detail was inspected where relevant. Native behavioral receipts distinguish actual acknowledgments and controlled faults from presentation-only execution results. Formal contrast/screen-reader conformance, complete save-conflict matrices and all cross-version journeys remain unverified. [Final decision](final-audit.md), [17 principles](final-principles.md), [validation](round-5-validation.md).

A [paired comparison manifest](comparison-manifest.json) records source paths/hashes for three Before/After figures: light attempt detail, dark Completed filter and dark authenticated unavailable overview. They are stored separately from product captures under screenshots/interface-fixes-2026-10-08/comparisons/learner/. Each pair uses native1440×900 sources; disposable fixture differences are explicitly labeled. [Pixel verification](comparison-pixel-verification.json) confirms exact RGB equality of all six complete source rectangles, with labels outside them. These figures compare presentation/context, not execution verdicts.
