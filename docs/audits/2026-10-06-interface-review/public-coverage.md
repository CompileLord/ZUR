# Public and account coverage inventory

40 fresh frames independently inspected, covering P01–P08 and P40–P42; [manifest](public-manifest.json) has corrected captions, and [route/state inventory](coverage-inventory.md) lists every frame. Standard 1440×900 plus desktop full-page captures. Both themes cover normal landing/catalog/overview, sign-in/up, password request, contextual email notice, Help, pending policy/terms and error routes. Filtered/no-match catalog, form errors, reset/invitation variants and request receipt are dark-only unless the manifest says otherwise.

| Route / state | Result |
|---|---|
| `/`, `/courses`, filtered/no-match catalog and `/courses/:courseId` | Reviewed presentation; discovery journey and enrollment unverified. Dark landing is an animation frame, not settled headline evidence. |
| `/sign-in`, `/sign-up` | Normal dark/light reviewed; dark empty sign-in error and adult-consent registration error reviewed. Other field validation and registration success unverified. |
| `/verify-email` direct and email query | Rendered instructions reviewed; query context is not delivery evidence. |
| `/forgot-password` normal and submitted notice | Presentation reviewed; receipt does not establish mail delivery or usable reset link. |
| `/reset-password` two fixture-token queries | Initial unsubmitted forms reviewed; invalid-token rejection is **unverified**, contrary to original executor caption. |
| `/join/:token` valid fixture / unavailable | Presentation reviewed; unavailable action says Go to dashboard. Acceptance, authorization and CTA follow-through unverified. |
| `/help` | Normal/full dark/light reviewed; lower report action requires PU1, trusted modal Tab requires PU2. Modal screenshots missing. |
| `/privacy`, `/terms` | Truthful unavailable notices reviewed; linked signup agreement requires PU4; substantive content unavailable. |
| `/access-denied`, `/not-found` | Normal public safe-error presentation reviewed; authenticated contexts covered separately in learner L7. |

[Public/account plan](public-account-plan.md) proposes demonstrated reporting, workflow-copy and account-entry problems. [Independent live checks](codex-public-live.json) establish the dead lower action, focus escape and Escape closure. The focus-return check used a programmatic click without first focusing the trigger, so its false result does not establish a focus-return defect.

## Remaining evidence gaps

Every absent relevant state/theme remains unverified: settled/reduced-motion landing; delayed/error catalog and overview; actual discovery → account → enrollment journey; sign-in credential errors/session recovery; registration/verification success and delivery; reset submit/expiry/success/failure; invitation acceptance/revocation/recovery; Help modal light/dark, submission/validation/retry/receipt and native focus return; long policy content once supplied; narrow desktop. No real accounts or outbound messages were used as proof, and no legal text was invented.

All 40 frames rechecked on 2026-10-08 against all 17 principles. Help execution/save wording and landing example labels require PU3; signup-to-policy/terms availability requires PU4. Anonymous invitation acceptance and response HTTP codes are not established by these images. Existing PU1/PU2 keep their earlier live evidence; no new live behavior was executed in this recheck.
