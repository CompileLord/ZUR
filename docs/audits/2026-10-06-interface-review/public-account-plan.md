# Public and account plan

Analysis only; commit `0998ec0`; captures 2026-10-06, finalized 2026-10-08. Changes are **Proposed**. Written after learner, author and admin plans and inventories, then consolidated across roles. Selected earlier recommendations: reliable entry actions, actionable failures, preserved inputs and truthful account states. Evidence: [40-frame manifest](public-manifest.json), [coverage](public-coverage.md), [independent checks](codex-public-live.json). No account registration, outbound email delivery or invitation acceptance is certified.

## PU1 — Make both Help report actions work

**P1, confirmed defect; principles 2, 15, 17.** `/help` shows two report actions in the normal/full-page dark and light screenshots. Independent interaction with the lower action leaves the report dialog closed. `attachHelpListeners` in `packages/web/src/main.ts` uses `querySelector` and attaches the open handler only to the first matching trigger.

Bind all report triggers or use scoped event delegation; retain both discoverable entry points and existing report context/optional code sharing. Reuse the same dialog and capture the actual activating element for focus return. No page restructure is needed. Depends on S2 for shared lifecycle.

Acceptance: activate each entry using pointer and Enter/Space; exactly one dialog opens and focus enters it. Escape/cancel returns focus to the activating control. Under validation and controlled submission failure preserve description and consent, show actionable feedback, and retry once against a disposable fixture. Required after captures: each entry opening the dialog, retained-input failure and acknowledged receipt in both themes at 1440×900. Existing captures show entry points; modal-state screenshots remain missing.

## PU2 — Contain keyboard focus in Help reporting

**P1, confirmed defect; principles 4, 15.** `/help`: trusted browser Tab from Submit reaches an underlying link outside the open dialog. `HelpPage.ts` renders a custom `div` with `role=dialog`/`aria-modal`; current handler has no native modal or complete keyboard containment. This repeats learner L5.

Apply S2 to `HelpPage.ts` and `main.ts`: use a native modal where suitable, keep its accessible label, proper initial focus, background exclusion, close and recovery lifecycle. Preserve report fields, contextual IDs and explicit code-sharing consent. Reuse the existing admin native-dialog approach after checking rerender behavior.

Acceptance: Tab and Shift+Tab remain within the open modal, background controls cannot activate, Escape closes, and native activation plus close returns focus to the actual trigger. Test validation, pending, failure, retry and rerender in both themes. Required after captures: focused first/last controls and retained-input failure, plus native keyboard evidence. Escape closure was observed; focus-return failure is **not established** because the live check opened with a programmatic click that did not focus the trigger.

## Unresolved questions

The privacy and terms pages display pending-publication notices; these are truthful unavailable states, not a reviewed substantive policy. Policy publication requires supplied/approved content and is not invented in this interface plan. Reset-token screenshots show unsubmitted forms even for the invalid-token query; rejection is unverified. Verification email text does not establish delivery. Dark landing captures contain an entrance-animation frame, so settled layout and reduced-motion behavior need recapture. No other public/account redesign is proposed from normal screenshots alone.
