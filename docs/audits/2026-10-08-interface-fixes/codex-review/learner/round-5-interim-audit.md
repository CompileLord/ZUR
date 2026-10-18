# Learner visibility repair: remaining lifecycle regression

Source fix makes genuine restore failure feedback visible: own stable-open real503 probe has dialog.open=true, checkVisibility=true, display=flex, rect438x40 and preserved draft/page. Actual delayed successful restore now independently verifies code_drafts revision increases and seeded snapshot is restored, while native Back destination remains active; this is a real database acknowledgment, not a simulated request receipt.

However an unchanged original18-assertion rerun now has17 passed and1 failed: L2/L4 cancel→immediately reopen→real503 times out waiting for recovery text; dialog is closed in the failure snapshot. This is not the previously disclosed document-startup harness error; all other17 assertions execute and pass. Do not replace that original regression with the stabilized supplemental visibility probe.

Likely source cause confirmed by lifecycle structure: native dialog.close schedules a close event; closeRestoreDialog is also invoked unconditionally by that event. If the dialog has reopened before the queued old event arrives, the handler closes the current dialog again and clears feedback. Handle close events only for the currently closed lifecycle (e.g. skip stale close events when dialog.open is true); retain Escape/Cancel/cleanup/focus and current error reset. Also scope the admin close cleanup as already requested. Repeat original browser check without weakening assertions, and retain pending-ack pass. No new redesign or grader/policy claim.

## Same lifecycle defect independently confirmed in learner Report

A supplemental disposable browser check invokes the actual open/Cancel/reopen handlers in immediate sequence and waits150ms for queued native events. The reopened report ends closed and hidden, focus outside, with background inertness removed (0pass/1fail). Report also has an unconditional native close callback invoking closeReportModal. Guard stale close events for an already reopened dialog; preserve genuine Cancel/Escape/closed cleanup and consent reset. This is existing L5 lifecycle ownership, not a new design. [Result](round-5-report-reopen-interactions.json). Keep the original18 assertions unchanged and add this supplemental check after correction.

## Parent rerun after saved Restore guard

Codex independently reran the unchanged original18 assertions with only the output filename separated:18pass/0fail, including immediate Restore Cancel→reopen, actual503 draft retention, native keyboard containment and Escape. A separate held restore request confirms the disposable database draft changes while native Back remains at the selected Attempts list (1pass/0fail). [Original checks](round-5-original-interactions.json), [actual database acknowledgment](round-5-restored-draft-ack-interactions.json). Report immediate reopen remains failed until independently corrected; these passes do not grant overall learner approval.
