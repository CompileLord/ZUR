# Learner source review against HEAD2211878

The actual diff changes main.ts, LearningWorkspaceShell.ts, AttemptHistoryPage.ts, PythonWorkspacePage.ts, learning-navigation.ts, SafeDenialPage.ts, shells.css and the repair acceptance expectation. New navigation-history.ts and nine learner regression tests supplement these changes. MyCoursesPage.ts is already present at the base commit; its filtering renderer is reused, not newly introduced by this batch. Executor change reports remain provisional where they describe baseline code as a new implementation.

| Issue | Actual change | Current independent decision |
| --- | --- | --- |
| L1 | Loader validates and supplies existing activeFilter. | Sampled query, actual tabs, invalid default and native Back/Forward pass. |
| L2 | Attempts receive real navigation/progress/report context and list offset; native restore recovery retains draft. | Context and real delayed restore database acknowledgment pass; immediate reopen lifecycle pending. |
| L3 | Scoped visibility storage and initial/mounted shell state; scoped module/scroll storage. | Actual Python→theory/reload, account separation and Attempts scope pass. Long syllabus scroll and version migration remain partial. |
| L4 | Detail uses readable capped inset and local horizontal code overflow. |1440/1100 visual and native overflow checks pass. |
| L5 | Native report modal with inert background, owned listeners and unmount cleanup. | Tab/ShiftTab/Escape, genuine503 retention and route departure pass; immediate reopen lifecycle pending. |
| L6 | Profile dirty guard covers indexed Back/Forward cancellation and stores/removes scoped draft safely. | Native cancellation, confirmed discard, actual pending save acknowledgment and denied storage pass. |
| L7 | Safe unavailable pages retain authenticated shell; all5xx/network treated as recoverable overview failures. | Sampled404 and500/502/503/504 Retry recovery pass. |
| L8 | Sample result badge renamed Test samples. | Both-theme fixture presentation reviewed; no production execution/grading certification. |

Admin document close/backdrop handlers are scoped to native admin-modal-dialog ownership to prevent resetting learner errors or stealing focus. A native close event queued before reopening must also be ignored for the reopened lifecycle; this is still under correction. Sources retain authored task material and the accepted instructions/code split. Formal accessibility, screen readers, complete permission matrices, actual production runner isolation and untested historical/version transitions remain unverified.

Validation details and actual baseline failures are preserved in round-3-validation.md. Current source changes require final targeted checks after lifecycle correction. Approval is not granted by this source review.
