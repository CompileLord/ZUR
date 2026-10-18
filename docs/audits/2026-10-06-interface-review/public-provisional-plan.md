# Public and account entry provisional plan

Reviewed 2026-10-06 against commit 0998ec0. Analysis only; all changes below are **Proposed**. 40 fresh screenshots captured across P01–P08 and P40–P42 in both light and dark themes; inspected against route contract, live CDP fixtures, and current public page templates. Screenshot root: `../../../screenshots/interface-review-2026-10-06/public/`. Exact state records: [public-manifest.json](public-manifest.json); [public-coverage.md](public-coverage.md).

Selected prior recommendations: clean and accessible entry journeys, resilient token recovery without dead ends, accessible form validation, and consistent anonymous shell presentation.

---

## PU1 — Preserve anonymous discovery shell across unauthenticated routes

**Confirmed compliant pattern; P2; Proposed / Retain.** Routes P01–P03, P40–P42; evidence [public landing](../../../screenshots/interface-review-2026-10-06/public/public-p01-landing-dark-normal.png), [public catalog](../../../screenshots/interface-review-2026-10-06/public/public-p02-catalog-dark-normal.png), [access denied](../../../screenshots/interface-review-2026-10-06/public/public-p42-access-denied-dark-normal.png).

All public and marketing routes render consistently inside the unauthenticated discovery shell (S1) or account entry shell (S2). Navigation provides top-level Explore courses, Theme toggle, and Sign in actions without exposing internal role navigation or authenticated app sidebars to anonymous visitors.

Retain this clean boundary across all public surfaces.

---

## PU2 — Provide actionable recovery links on expired or invalid tokens

**Confirmed compliant pattern; P1; Proposed / Retain.** Routes `/reset-password` and `/join/:token`; evidence [invalid reset token](../../../screenshots/interface-review-2026-10-06/public/public-p07-reset-password-dark-invalid.png), [invalid invitation](../../../screenshots/interface-review-2026-10-06/public/public-p08-join-invitation-dark-invalid.png).

Both password reset and course invitation token consumption flows handle expired or revoked tokens with clear, non-technical explanations and direct next actions:
- Expired password reset tokens direct the user to the Forgot Password page to generate a fresh link.
- Expired course invitations provide a direct link to Explore Courses in the public catalog.

Retain these recovery paths to ensure users never face dead-end error pages.

---

## PU3 — Ensure accessible error association on authentication forms

**Candidate enhancement; P2; Proposed.** Routes `/sign-in`, `/sign-up`, `/forgot-password`; evidence [sign-in error](../../../screenshots/interface-review-2026-10-06/public/public-p04-sign-in-dark-error.png), [sign-up error](../../../screenshots/interface-review-2026-10-06/public/public-p05-sign-up-dark-error.png).

Client validation currently highlights invalid inputs with styling. To ensure accessibility for screen reader users and keyboard navigation:
1. Ensure field error messages possess unique IDs linked via `aria-describedby` on the corresponding `<input>`.
2. Set `aria-invalid="true"` on invalid inputs upon form submission.
3. Automatically move keyboard focus to the first invalid form input when submission is prevented.

Components: `packages/web/src/pages/auth/AuthPages.ts`.

Acceptance: submit empty sign-in or sign-up form → verify focus moves to email/name input, screen reader announces invalid state and error description, and corrected input clears invalid status. Required after captures: dark and light error states with accessibility tree validation.
