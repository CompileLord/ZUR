# Fresh real-user feature audit — 2026-10-05

Chrome CDP browser interactions at 1440×900 in an isolated SQLite/API/Vite/worker/Chrome setup. Mutations were limited to disposable audit fixtures and corroborated with read-only database queries. Shared application data and external services were not used. Screenshots and per-action evidence: [features evidence](../../../screenshots/audit-2026-10-05/features/actions.json); page captures are in the same directory.

Counts: **16 PASS, 1 FAIL, 0 BLOCKED, 6 NOT TESTED**. PASS means that the named workflow worked in the tested fixture and viewport. NOT TESTED items are explicit gaps, not inferred failures or passes.

| Feature | Result | Observed result |
|---|---|---|
| Public landing, catalog, help, privacy, terms, and not-found routes | PASS | Selected routes rendered expected content. Pricing was checked separately and is not included in this pass. |
| Public catalog search and language filter | PASS | Search and Spanish-language filtering returned the seeded matching course. |
| Signup invalid-input validation | PASS | Empty signup was blocked by required fields and age confirmation. |
| Invalid sign-in validation | PASS | Invalid credentials produced a visible form error. |
| Email verification valid and consumed-token rejection | PASS | A valid fixture token verified the account; reuse was rejected. |
| Password reset valid and invalid token | PASS | Valid fixture reset succeeded; an invalid token was rejected. |
| Profile edit and theme preference | PASS | Display name saved and light theme applied. A persisted language setting was not present. |
| Security password change and restore | PASS | Password changed and was restored on the isolated account; global sign-out revoked all fixture sessions. |
| Privacy export request, deletion cancel, and deletion commit | PASS | Export request created; deletion request could be canceled, then committed to `pending_deletion`. |
| Admin category CRUD and user restore/role/status actions | PASS | Disposable category create/edit/delete and fixture-user restore, author grant/revoke, suspend/restore succeeded. |
| Admin list search/filter and detail route inventory | PASS | User search/status filter worked; course, report, media, execution, and audit list/detail routes rendered. |
| Admin course/report/media/execution mutations | PASS | Fixture course suspend/restore, report resolve, media quarantine/restore, and execution pause/resume succeeded. |
| Author AI token issue/replace/expired filter/setup/revoke | PASS | UI issued/replaced/revoked a token, displayed the local setup guide, and listed a seeded expired token. No secret was written to evidence. |
| Unauthenticated admin route protection | PASS | Unauthenticated admin navigation redirected to sign-in without rendering admin user data. |
| Admin support access and privacy export fulfillment/purge | PASS | Support access grant/revoke, export fulfillment, and purge of an aged disposable deletion fixture succeeded. The deletion tombstone was constrained to the temporary fixture directory. |
| Admin required-step waiver impact review | PASS | Selecting “Version 2 · Echoing Numbers” displayed an impact estimate: one active enrollment, all pinned to that version. Review only; waiver was not applied. |
| User pagination and audit action/reason filters | **FAIL (medium)** | User pagination advanced to page 2 (21–25 of 25); audit pagination controls appeared. Submitting `action=audit:fixture_page` and `reason=fixture pagination` produced an empty UI state. Read-only API returned HTTP 200 with 25 total matches and 20 items. Repro URL: `/admin/audit?action=audit%3Afixture_page&reason=fixture+pagination`. The client route loader compares the whole pathname to `/admin/audit`, so a query string bypasses loading the audit data ([main.ts](/home/compilelord/new/vibecoding/zur/packages/web/src/main.ts:1633)). This is a frontend rendering/routing defect; the API fixture data was present. |
| Pricing/payments page | NOT TESTED | No `/pricing` route/page is defined in app routing. |
| Email delivery/provider inbox and OAuth sign-in | NOT TESTED | No outbound email inbox or OAuth provider is configured in the isolated services. |
| Password reset expiry boundary and verification resend delivery | NOT TESTED | Valid, invalid, and consumed tokens were exercised; exact expiry boundary and outbound resend require timing/provider setup. |
| Persisted language preference | NOT TESTED | Profile and appearance pages expose no language preference control; catalog language filtering was tested. |
| Live token expiry boundary and external MCP clients | NOT TESTED | Seeded expired-token filtering and local setup guide were checked; real-time expiry and third-party client behavior were not. |
| Remaining admin workflows | NOT TESTED | Invitation moderation, course archive, privacy status updates beyond fulfillment/purge, advanced audit-filter combinations beyond action/reason, and bulk capabilities were not exercised. |

## Usability recommendations from observed pages

These are design recommendations, separate from reproducible defects. They reflect the actual pages and controls exercised at the stated viewport; this was not a moderated usability study. No P0 usability issue was established.

| Priority | Observed page or action | Recommendation | User benefit |
|---|---|---|---|
| P1 | `/courses`; search and Spanish language filter | Keep search and filters together, show active filter chips and result count, and provide “Clear all.” | Learners can understand why a course appears and change criteria in place. |
| P1 | `/sign-up`, `/sign-in`, `/forgot-password`, `/reset-password` | Put field-specific validation beside each field and state password/age requirements before submission. | New learners can fix errors without guessing what blocked the form. |
| P1 | `/settings/privacy`; export and deletion flows | Present export and deletion as separate request cards with status, expected timing, next step, and cancellation when available. | Users can distinguish a data copy from account closure and know what happens next. |
| P1 | `/admin/users/:id`; role/status mutation forms | Make target account, current state, selected action, reason, and reauthentication part of one focused confirmation. | Admins can verify the affected account and avoid repetitive form hunting. |
| P1 | `/admin/audit`; filtered view | Keep the active filters and result count visible, and render a deliberate error/empty state when list data fails to load. | Staff can distinguish zero matches from a page that failed to load. |
| P2 | Admin navigation and mutation pages | Group dense repeated mutation forms by task; keep one primary action visible and reveal less-used actions on demand. | Administrators can scan lists and complete routine tasks with fewer competing controls. |
| P2 | `/admin/reports`, `/admin/media`; row and detail dialogs | Put current status, impact, and next available action on each row, with history in the detail view. | Staff can triage without opening every item. |
| P2 | `/admin/execution` and other reauthenticated actions | Explain the reason/password requirements before submission, preserve inputs after recoverable errors, and show the resulting state plus audit link. | Operators can finish sensitive actions without repeating entered context. |
| P2 | Repeated audited admin actions; observed generic rate-limit feedback | Explain the rate limit before it is reached and show when retry is available. | Operators can plan batches instead of interpreting a generic “Too many attempts” as an action failure. |
| P2 | `/settings/ai-connections`; token issuance/replacement | Show effective scopes/course restrictions before issue or replacement, and clearly say the secret is shown only once. | Authors can select least-needed access and handle the credential safely. |

Top five quick wins:

1. Show active catalog filters, result count, and “Clear all.”
2. Add field-level sign-up/sign-in validation and make password and age requirements visible.
3. Show privacy request status and next steps on the privacy settings page.
4. Combine each admin mutation’s target, current state, reason, and reauthentication in a focused confirmation.
5. Fix query-string handling on the audit route and show filtered result counts.

A simple learner journey is: open `/courses` → search and filter with the matching count visible → inspect the course overview → create an account with inline guidance → verify email → start the first lesson. A simple admin journey is: open the relevant filtered list → inspect the user/course/report/asset → choose one clearly named action → confirm target and reason once → see the resulting state and audit record.

## Scope limits

The audit covers only the listed routes and actions. `/pricing` is not defined in routing. Provider email delivery, OAuth, and external AI/MCP client behavior need provider services and remain untested. Some admin workflows and the full advanced audit-filter matrix also remain untested. Browser interactions are the primary evidence; local API/database checks corroborated disposable-fixture state. Evidence files are under `screenshots/audit-2026-10-05/features/`.
