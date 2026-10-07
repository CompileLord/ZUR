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

The privacy and terms pages display pending-publication notices; these are truthful unavailable states, not a reviewed substantive policy. Policy publication requires supplied/approved content and is not invented in this interface plan. Reset-token screenshots show unsubmitted forms even for the invalid-token query; rejection is unverified. Verification email text does not establish delivery. Dark landing captures contain an entrance-animation frame, so settled layout and reduced-motion behavior need recapture. The additional changes below follow demonstrated cross-page wording and account-entry problems.

## PU3 — Explain the actual execution and save workflow

**P2, confirmed copy mismatch; principles 7, 11, 16; Proposed.** `/help` normal/full dark/light says Run tests against samples or custom input and tells learners to check Saved in the header. `HelpPage.ts` repeats that Saved claim in its disclosure. Learner toolbar instead separates Run, Test samples and Submit and deliberately suppresses routine autosave status. `/` illustration in `LandingHero.ts` labels samples Run (Samples), displays Saved and includes a filename/runtime header.

In Help name all three actions: Run executes and displays stdout/stderr; Test samples compares public examples; Submit assesses and can record completion. Explain actionable save failures/conflicts and supported draft recovery without telling users to find a routine Saved badge. Align the landing example's sample label with Test samples and remove routine save/filename/runtime ornament; retain Example workspace wording, useful code/problem illustration and actual pause-motion control. Hero action badges are spans, not verified interactive controls; render them clearly as example annotations rather than button-shaped primary actions. Do not claim the example executes or grades anything. Components: HelpPage/LandingHero; shared S4 terminology with L8 and A4; after reporting fixes.

Acceptance: Help, landing illustration and workspace use the same three action meanings; Run never implies correctness or progress; autosave help points to actual errors/recovery. Keyboard focus reaches real links/controls, not decorative badges. Required after screenshots: Help relevant sections and landing example in both themes, plus sample/custom/submit failure/result states; check actual copy against current handlers.

## PU4 — Resolve account entry that asks agreement to unavailable documents

**P1, confirmed journey gap; principles 2, 9, 15, 17; Proposed.** `/sign-up` normal/error frames require a checkbox agreeing to Terms of Service and Privacy Policy, while `/terms` and `/privacy` in both themes display not-yet-available notices. The notices are truthful, but a prospective user cannot read the documents the form asks them to agree to. This is an interface/availability finding, not a legal-conformance judgment.

Retain adult eligibility and readable policy links. Supply product-approved documents at both destinations before presenting agreement as an available account-entry step. When either document is unavailable, clearly explain that registration is temporarily unavailable and offer useful browse/help exits; preserve nonsecret entered information on return, and align client/server availability behavior. Do not invent policy terms, bypass the existing checkbox or imply review of absent text. Components: `pages/account/SignUpPage.ts`, policy/terms renderer and account-entry availability contract. Dependency: approved content and a product decision about temporary availability; implementation waits for that input, not for guessed text.

Acceptance: real policy links open readable approved documents and return preserves entered nonsecret context; missing-content state clearly explains next steps and does not ask agreement to nonexistent text; published-content state permits normal fixture registration with truthful errors. Required after screenshots: available/unavailable account entry and both documents, light/dark at 1440×900; actual registration and return navigation remain to test.

## Batch recheck against all 17 principles — 2026-10-08

All 40 public/account PNGs reinspected after admin updates were saved. PU1/PU2 retain earlier independent interaction evidence; this screenshot recheck adds PU3/PU4. Reset-token rejection remains unverified. Anonymous valid invitation has Sign in to accept/Create account, not an already-authorized Accept button. Error screenshots establish presentation, not HTTP response status.

1/2/16: PU3 removes misleading/redundant annotations while retaining useful explanation. 3/4/5/12: public/account shells intentionally differ from focused learner/editor shells; long-page navigation/return behavior unverified. 6/7/8/11: illustrative learner layout remains recognizable, PU3 aligns execution and quiet autosave; no fake editor shortcuts or runtime implied. 9/10: truthful selected/error/account states retained; PU4 resolves unavailable-document entry and real grading remains unverified. 13: form-return/query/password recovery requires live tests; no draft retention invented. 14: typewriter frames are intermediate, pause control visible; reduced-motion support and settled dark capture require verification. 15: PU1/PU2 repair report entry/focus; contrast/screen-reader checks remain gaps. 17: PU4 judges signup plus document destinations, not isolated clean forms; account/email/token/enrollment journeys still incomplete.
