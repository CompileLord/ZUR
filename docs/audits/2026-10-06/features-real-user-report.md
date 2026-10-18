# Fresh real-user feature re-audit — 2026-10-06

Isolated database, API, Vite, worker, and Chrome profile; Chrome CDP UI interactions at 1440×900. UI mutations were corroborated using read-only queries against the disposable SQLite fixture. Shared application data was not used. Screenshots and per-action JSON: [features evidence](../../../screenshots/audit-2026-10-06/features/actions.json).

Counts: {"PASS":12,"FAIL":5,"BLOCKED":0,"NOT TESTED":6}.

| Feature | Result | Detail |
|---|---|---|
| Public landing/catalog/help/privacy/terms/not-found routes (pricing route presence checked separately) | PASS | All selected public routes rendered expected text at 1440×900 |
| Public catalog search and language filter | PASS | Search and Spanish course filter reflected fixture |
| Signup form invalid-input validation | PASS | Empty signup remains blocked by browser required and age-consent validity checks |
| Invalid sign-in validation | PASS | Invalid credentials showed form error |
| Email verification valid and consumed token rejection | PASS | Valid token consumed; reuse displayed invalid/expired |
| Password reset valid token and invalid token | PASS | Valid reset succeeded and bad token rejected |
| Profile edit and theme preference | PASS | Profile saved; UI selected and applied light theme |
| Security password change and restore | PASS | Password changed/restored and global sign-out revoked all fixture sessions |
| Privacy export, deletion cancel and deletion commit | FAIL | click #btn-open-delete-modal: Could not compute box model. |
| Admin categories CRUD and user restore | FAIL | Could not compute box model. |
| Admin user list search/filter, courses moderation, reports, media, execution, audit | FAIL | admin courses absent |
| Admin course suspend/restore, report resolve, media quarantine/restore, execution pause/resume | FAIL | Could not compute box model. |
| Admin support-access grant/revoke and privacy export fulfillment/purge | FAIL | Could not compute box model. |
| Admin required-step waiver impact review | PASS | Selected Version 2 · Echoing Numbers and browser displayed affected-enrollment review: 1 active enrollment(s) will be affected · all active enrollments pinned to this version. |
| Admin list pagination and audit action/reason filters | PASS | User page 2 reached; exact audit API {"status":200,"total":25,"items":20,"allExact":true}, UI filtered page1, page2 (5 rows), previous navigation, matching event detail, and blocked-request error plus working retry verified: Failed to fetch Retry |
| Author AI token issue/replace/expired filter/setup/revoke | PASS | Token issue/replace/revoke and local setup guide worked in UI; seeded expired token appeared in expired filter; raw secrets excluded from evidence |
| Unauthenticated admin route protection | PASS | Unauthenticated request did not expose admin users list |
| Pricing/payments page | NOT TESTED | NOT TESTED: no /pricing route/page exists in app routing. |
| Email delivery/provider inbox and OAuth sign-in | NOT TESTED | NOT TESTED: no outbound email or OAuth provider is configured in isolated local services. |
| Password reset exact expiry boundary and verification resend delivery | NOT TESTED | NOT TESTED: valid, invalid, and consumed tokens were tested; exact expiration edge and outbound resend delivery require timing/provider setup. |
| Persisted language preference setting | NOT TESTED | NOT TESTED: inspected profile/appearance pages expose no language preference control; public catalog language filtering is covered. |
| Live token expiry boundary and external MCP clients | NOT TESTED | NOT TESTED: seeded expired-token filter and local setup guide were checked; actual clock expiry and third-party integration were not. |
| Remaining admin workflows | NOT TESTED | NOT TESTED: invitation moderation, course archive, privacy status update, full advanced audit filters, and bulk capabilities remain outside this run. |

## Usability recommendations from observed pages

These are design recommendations, separate from functional results. They come from the actual pages and controls exercised in this audit; this was not a moderated usability study. No P0 usability issue was established in this pass.

| Priority | Observed page or action | Recommendation | User benefit |
|---|---|---|---|
| P1 | /courses; search and Spanish language filter | Keep search, category, difficulty, and language filters in one compact bar. Show active filter chips, result count, and Clear all. | Learners can see why courses appear and refine results without repeatedly changing pages. |
| P1 | /sign-up, /sign-in, /forgot-password, /reset-password; empty sign-up blocked by browser required-field and age-consent validity | Keep the immediate form goal and primary action at the top, show field-specific inline errors after submit, and state password/age requirements beside the relevant fields. | New learners can correct the form without guessing which input blocked them. |
| P1 | /settings/privacy; export, deletion confirmation, and admin restoration of the pending-deletion fixture | Show export and deletion as separate request cards with current status, next step, timing, and a clear way to cancel a pending deletion when policy permits. | Users can distinguish a downloadable copy from account closure and understand what follows submission. |
| P1 | /admin/users/:id; access-control forms for grant/revoke author and suspend/restore | Present the target account, current state, and selected action together in a single confirmation step. Keep reason and administrator-password fields inside that step instead of repeating several open forms. | Admins can verify the affected account and reduce accidental role or status changes. |
| P2 | Admin shell at 1440x900; admin-users-dark.png | Group sidebar links into clear areas and keep navigation labels visually distinct from the ZUR brand/Admin badge. | The admin workspace reads as one purposeful navigation system and is faster to scan. |
| P2 | /admin/reports and /admin/media; opening a row's detail dialog | Put status, impact, and the next available verb on the list row, while retaining history and detailed review in the dialog. | Staff can triage routine items without opening every detail view. |
| P2 | /admin/categories, /admin/courses/:id, /admin/execution; audited mutations require reason and reauthentication | Explain both requirements beside the fields and preserve entered values after recoverable errors. After success, show the new state and a link to the audit record. | Admins can complete audited actions with less repetition and verify their result. |
| P2 | /admin/execution; isolated run reached administrator reauthentication rate limit while testing repeated audited mutations | Explain the limit before it is reached and show a specific retry time in the feedback. | Operators can plan a batch of changes instead of treating a generic Too many attempts message as a failed control. |
| P2 | /settings/ai-connections; token creation and revocation | Summarize effective permissions and course scope before issuance; state clearly when a secret is shown only once. | Authors can issue the narrow credential they intend and handle it safely. |

Top five quick wins: (1) group admin navigation links by task, (2) show catalog active-filter chips and a result count, (3) add inline sign-up and sign-in validation, (4) state deletion timing and pending-request next steps on Privacy settings, and (5) combine each admin mutation's target, action, reason, and reauthentication in one focused confirmation.

Simplified learner journey: open /courses → search/filter and see matching course count → review the course overview → create an account with inline guidance → verify email → enter the first lesson. Simplified admin journey: open the relevant filtered list → inspect user, course, report, or asset detail → choose one clearly named action → confirm target and reason once → see the resulting state and audit link.

## Scope limits

The exercise covers the listed routes and actions only. Items with NOT TESTED status are explicit gaps, not assumed passes. The /pricing route is not defined in app routing. Provider email delivery, OAuth, all external AI/MCP client behavior, and several admin workflows listed above were not tested. Automated server/database checks only corroborated browser actions. Full action log and 1440x900 screenshots are under screenshots/audit-2026-10-06/features.
