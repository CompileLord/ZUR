# Independent learner implementation review

Status: **Approved for reviewed learner L1–L8 scope.** [Final independent decision](final-audit.md) and [all17 principles](final-principles.md) complete this batch before author begins. The history below preserves rejected rounds and their corrections. The same Gemini learner executor corrected each rejected finding; acceptance rests on Codex's independent source, screenshot and native-browser checks.

Authority: [interface principles](../../../interface-review-agent-prompt.md), [reviewed learner plan](../../../2026-10-06-interface-review/learner-plan.md). The user subsequently authorized implementation; the original prompt's analysis-only restriction applied to the completed planning review. Its 17 interface principles and data safeguards remain applicable.

## Independent baseline

[Before interactions](before-interactions.json) came from a separate fresh SQLite fixture, migrations and seed, a temporary Vite/API server, and Chrome/CDP. This run preceded the integrated learner repairs; the executor was already active, so it is not represented as an immutable checkout replay. The checks used actual rendered routes, real SPA links, browser history and trusted Tab/Shift+Tab/Escape keys. The profile save failure was an explicitly controlled HTTP 503. No screenshots were captured by this baseline; no real accounts, course publication or external writes occurred. The browser, servers, database and temporary profile were cleaned up.

Eight of nine acceptance checks failed before the repairs were integrated: Completed/All query selection, sidebar reload persistence, Attempts curriculum/task context, report modal containment, profile Back cancel/confirm handling, and authenticated unavailable overview context. Profile save failure already preserved the draft. Sidebar collapse survived a genuine Python-to-theory SPA transition; reload lost it. Thus the old incorrectly labeled SPA screenshot is not used as evidence of transition loss.

## Approval requirements

After the executor completes: independently inspect the diff, run behavioral checks, inspect every new learner screenshot and its provenance, run relevant regression tests/build, and write issue-by-issue acceptance or a concrete correction request. A successful wrapper status or clean screenshot alone does not establish correctness. Corrections use the same executor conversation. No learner approval or next-role screenshot review occurs before this audit.

Production execution isolation/grading, screen-reader behavior and unavailable fixture states must remain explicitly unverified unless independently established. Existing historical screenshot-evidence test failures must not be hidden by fabricating old evidence or weakening tests.

## First repair audit

[Round 1 audit](round-1-audit.md), [native interaction results](round-1-interactions.json), [all 50 capture coverage](round-1-coverage.md), and [decoded hashes](round-1-image-verification.json). Thirteen behavior checks passed and five failed. Corrections resume Gemini 3.8 Flash High conversation `f8b02bd9-04ac-4ca4-89ff-6b71bf1081d0`. The first wrapper lost its completion result; this audit uses independently verified artifacts, not a successful executor status.

## Second repair audit

[Round2 audit](round-2-audit.md) retains the18 original passing checks but rejects four supplemental failures and injected error captures. [All52 visual coverage](round-2-visual-review.md) and [current decoded hashes](round-2-image-verification.json) were reviewed in learner-only batches. Author has not begun.

## Third repair audit

[Round3 audit](round-3-audit.md) and [all52-frame review](round-3-visual-review.md) record successful sampled behavior but two invalid profile-error frames. Codex independently reran the core18 checks, Forward/history, delayed restore, allfour5xx, editor/quiz and scope probes. Final learner approval and author start remain pending corrected evidence.

## Fourth capture audit

[Round4 audit](round-4-audit.md) and [all54 new-frame coverage](round-4-visual-review.md) preserve corrected profile/report feedback and strict metadata. The new restore-failure images demonstrate unreadable foreground feedback; a separate real503 CSS-visibility check confirms it. The document-level admin close handler incorrectly resets learner dialog errors. This is a narrow existing L2 recovery correction, not a new redesign. Latest wrapper reported ERROR despite nonempty prose and exit0; no delegation-success claim is made.

## Fifth targeted capture review

[Round5 visual review](round-5-visual-review.md) accepts the two corrected foreground-error frames as visual evidence. All106 earlier PNG hashes are unchanged; [all108 decoded captures](round-5-image-verification.json) are recorded. The [interim lifecycle audit](round-5-interim-audit.md) separately retains the original17-pass/1-failure result. Correct foreground feedback does not establish correct immediate reopen behavior.
