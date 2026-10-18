# Real-user feature re-audit — 2026-10-06

This is a fresh browser re-audit after the Codex/agy repairs. The full feature run used a newly seeded disposable SQLite database, isolated API/Vite/worker processes, a fresh Chrome CDP profile, and a 1440×900 desktop viewport. A second isolated run focused on the repaired audit filters, event details, and request-failure recovery. Controls were operated with CDP mouse and keyboard input; route navigation and screenshots also used CDP. Fixture changes were limited to disposable audit users, courses, reports, media, categories, tokens, and audit rows. The harness cleaned up its temporary databases and child processes.

Counts: **17 PASS, 0 FAIL, 0 BLOCKED, 6 NOT TESTED**. These counts represent individual browser workflows, not every feature in the application. The machine-readable per-action record is [actions.json](../../screenshots/audit-2026-10-06/features/actions.json). Screenshots are in [the evidence directory](../../screenshots/audit-2026-10-06/features/).

## Repaired admin audit route

Seeded 25 disposable audit events sharing the exact action `audit:fixture_page` and reason `fixture pagination`. Through the admin UI, I submitted both filters and verified the resulting browser URL and rows. A read-only request using the same action, reason, limit, and offset returned HTTP 200, `total: 25`, and 20 records; every returned record matched both filter values. The UI showed “Showing 1–20 of 25,” Next displayed rows 21–25, and Previous returned to the first page. Opening the first event showed its raw action and reason in the detail page.

I then blocked the audit API request in Chrome. The UI displayed the “Failed to fetch” alert and a Retry control. After unblocking the request, clicking Retry restored the audit list. The error-state capture is [admin-audit-load-error-dark.png](../../screenshots/audit-2026-10-06/features/admin-audit-load-error-dark.png). The filter, page, detail, and successful retry checks all passed.

## Feature inventory

| Feature | Result | Observed behavior |
|---|---|---|
| Public landing, catalog, help, privacy, terms, and not-found routes | PASS | Selected routes rendered expected content at 1440×900. Pricing is assessed separately below. |
| Catalog search and language filter | PASS | Search and the Spanish-language filter returned the seeded matching course. |
| Signup invalid-input validation | PASS | Empty signup was blocked by required fields and adult confirmation. |
| Invalid sign-in validation | PASS | Invalid credentials produced a visible form error. |
| Email verification | PASS | A valid disposable verification token succeeded; reusing the consumed token was rejected. |
| Password reset | PASS | A valid disposable reset token succeeded; an invalid token was rejected. |
| Profile and appearance | PASS | Display-name update saved and light theme selection applied. A persisted language preference control was not present. |
| Account security | PASS | Password changed and was restored on the disposable account; global sign-out revoked its fixture sessions. |
| Privacy self-service | PASS | Export request was created; deletion dialog cancel worked; a second request committed the disposable account to `pending_deletion`. |
| Admin categories and user access controls | PASS | Disposable category create/edit/delete and fixture-user author grant/revoke, suspend/restore succeeded through the UI. |
| Admin search, filters, and route inventory | PASS | User search/status filter worked; course, report, media, execution, and audit list/detail routes rendered. |
| Admin course/report/media/execution actions | PASS | Disposable course suspend/restore, report resolve, media quarantine/restore, and execution pause/resume succeeded. |
| Admin support access and privacy operations | PASS | Support-access grant/revoke, export fulfillment, and purge of the aged disposable deletion fixture succeeded. Purge tombstone path was confined to the temporary directory. |
| Required-step waiver review | PASS | Version 2 · Echoing Numbers displayed one affected active enrollment pinned to that version. This was an impact review; the waiver was not applied. |
| Audit filters, pagination, detail, and load-error recovery | PASS | Exact action/reason filters returned 25 rows, pagination worked both directions, event detail matched, and blocked-request error recovered through Retry. See the audit-route section above. |
| Author token lifecycle and setup UI | PASS | UI issued and replaced a token, showed local setup instructions, listed a seeded expired token, and revoked the replacement. Raw credentials were excluded from evidence. |
| Unauthenticated admin boundary | PASS | Unauthenticated navigation redirected to sign-in without exposing admin user data. |
| Pricing/payments page | NOT TESTED | There is no `/pricing` route or page in app routing. |
| Email delivery/provider inbox and OAuth sign-in | NOT TESTED | No outbound email inbox or OAuth provider is configured in the isolated environment. |
| Exact password-reset expiry and verification resend delivery | NOT TESTED | Valid, invalid, and consumed tokens were covered; exact expiry timing and outbound resend require provider/time setup. |
| Persisted language preference | NOT TESTED | Profile and appearance pages expose no language preference control. Catalog language filtering was tested. |
| Live token-expiry boundary and external MCP clients | NOT TESTED | Seeded expired-token filtering and the local setup guide were checked; real clock expiry and third-party client behavior were not. |
| Remaining admin workflows | NOT TESTED | Invitation moderation, course archive, privacy status changes beyond tested fulfillment/purge, complete advanced audit-filter combinations, and bulk capabilities were not exercised. |

## Failures and limits

No product failure was reproduced in this re-audit, so there are no new severity-ranked defects to report. The repaired audit filter, pagination, detail route, and failure recovery all passed the described browser checks. An absent pricing page and the provider-dependent items remain NOT TESTED; they are not represented as working features. The run did not cover every route, every combination of admin filters, external provider flows, or mobile/responsive behavior.

The underlying repair acceptance record separately reports **597 automated tests, production build, seven repair-specific Chrome workflows, and host-side execution sandbox checks**. Those are not counted as real-user feature passes here; the report above counts only workflows executed in this fresh feature browser run.
