# Browser feature audit: auth, catalog, settings, teacher/admin, responsiveness

Date: 2026-10-04  
Environment: local Vite at `http://localhost:5173`, API at `http://localhost:3001`, Chrome headless through the DevTools protocol.  
Scope: public discovery and account flows, profile/settings, teacher workspace entry, admin pages and reversible actions, and responsive layout. Root’s S3/S4 browser journeys and the parallel lesson/code execution audit add the remaining product journeys; their evidence is linked below.

## Result

Browser sign-up and sign-in worked with isolated accounts. Profile and appearance settings saved and were restored. I changed the author test account password through the UI, signed in with the new password, changed it back through the UI, and verified the original password still worked. Data export generated a ready download panel. A temporary AI access token was created, shown in the UI’s masked one-time field, then revoked; the row showed Revoked and its revoke action disappeared.

An isolated admin account created, renamed, and deleted a uniquely named temporary category through the admin dialogs. After deletion, the seeded Programming category remained. The author account received the generic access-denied page at `/admin`; the admin account loaded the admin overview and all audited admin pages. The execution switch remained enabled.

The local email mock did not expose a verification link to the browser, so I marked only the newly registered test account verified in local SQLite to continue authenticated checks. The separate worker heartbeat was unavailable in this local setup.

## Browser checks

| Area | Outcome | Evidence / notes |
|---|---|---|
| Landing page | Pass | Chrome DOM capture showed the “Understand it. Then write it.” hero and public shell. |
| Public catalog and overview | Pass | `/courses` listed Python foundations and rendered search/category/level/language filters; `/courses/course-python-foundations` rendered outcomes, prerequisites, version, modules, lessons, and step types. |
| Sign-up | Pass with delivery limitation | Submitted a new account through the browser form with display name, email, password, and adult consent. The app opened `/verify-email` and displayed a masked email address. The local email mock did not provide an in-browser verification link. |
| Sign-in and learner home | Pass | The isolated account signed in through the form and landed on `/learn`. Its empty state prompted the learner to enroll or open an invitation. |
| Forgot password and help | Pass, render only | Recovery form rendered with its generic reset flow. Help rendered account verification, enrollment, draft saving, Run Samples vs Submit, and issue-reporting guidance. No reset email was requested. |
| Profile settings | Pass | Changed the display name, saw “Profile display name updated successfully,” then restored the original test name. The verified email was read-only. |
| Appearance settings | Pass | Changed theme to Light, editor font size to 16px, and indentation to 2 spaces; the page showed “All preferences saved.” Restored System, 14px, and 4 spaces. |
| Password change | Pass, changed and restored | Changed the author test account password in Security settings, signed in with the new password, changed it back in the UI, and signed in with the original password. |
| Session revocation | Pass, confirmation only | Opened the “Sign out of all devices” confirmation modal and cancelled it; no session was revoked. |
| Privacy export | Pass | Submitted the export request for the author test account. The page reported “Data export package generated” and displayed the ready panel and download link. |
| Privacy deletion | Not exercised | The deletion action would place this otherwise reusable test account into its deletion lifecycle. The account was retained for other role checks. |
| AI connections | Pass | Created a temporary token with the default draft-authoring preset. The one-time value appeared in a password-masked field; the test recorded only its length (92), not its secret. Revoked it through the confirmation dialog and verified the Revoked status and removal of the revoke action. No active audit token remains. |
| Teacher workspace | Pass | `/teach` rendered the no-courses state and sample structure explainer. “New course” opened a modal with a title field and private-draft explanation; no course was created in this audit. |
| Author access boundary | Pass | The author account opening `/admin` received the generic “This page isn’t available” denial. |
| Admin overview and listings | Pass | `/admin`, `/admin/users`, `/admin/courses`, `/admin/categories`, `/admin/reports`, `/admin/media`, `/admin/execution`, and `/admin/audit` rendered their headings, filters, listing data, and empty states. |
| Admin category CRUD | Pass, reversible fixture | Created `Audit Probe Retry 20261004`, renamed it to `Audit Probe Retry 20261004 Edited`, then deleted it through the UI with reason and administrator password. The final listing no longer contained the temporary category; Programming remained. |
| Admin execution | Pass, read-only | Confirmed execution was enabled and its control and confirmation form rendered. The kill switch was not changed. Queue was idle; separate worker telemetry was unavailable. |
| Responsive catalog | Pass | Catalog measured at 1440×900, 768×1024, and 390×844. `documentElement.scrollWidth` matched viewport width at all sizes. At 390px the filters collapsed behind a Filters control. |

## Additional browser journey evidence

- The S3 journey completed successfully, covering token issue/replace/revoke, an official MCP client SDK, cross-author containment, image upload/render, batch idempotency, activity diff/restore, MCP publishing, and mobile revoked-token cards. See [MCP browser summary](evidence/app-audit-mcp-browser-summary.json).
- The S4 journey completed all six flows, including catalog filters and mobile filter application, admin telemetry, report snapshot links, and mobile admin pages. See [supplemental browser log](evidence/app-audit-s4-browser-summary.txt) and `screenshots/app-audit-s4/`.
- Lesson and code execution workflows are documented in the [course/lesson audit](AUTHOR_BROWSER_AUDIT.md) and [learner audit](LEARNER_BROWSER_AUDIT.md).

## Test data and isolation

Created a unique browser signup account `audit.features.1791113627057@zur.local` and a separate admin account `audit.admin.20261004@zur.local`; no pre-existing demo user was changed. The signup account’s verification flag and author capability were set directly in local SQLite because local mock mail does not expose its verification link. Profile and appearance values were restored. Its password was changed and restored through the UI. The temporary token was revoked, and the temporary admin category was deleted. No test course, published content, existing category, account deletion, or execution-state change was made.

## Automated checks

- `npm run build`: passed. Vite emitted a bundle-size warning: the main minified JavaScript chunk was about 977 KB, above its 500 KB advisory threshold.
- `npm test`: 542 passed, 13 failed, 555 total. All 13 failures were evidence/artifact checks that could not find expected screenshots; no functional test assertion failed in this run. Missing evidence covers S1-M02 and T087 viewport/theme captures, high-DPR and 200% zoom captures, roster layout, P15/P27 journeys, P12/P13 media flows, P43 token lifecycle, and admin waiver review. Full output: `/tmp/zur-feature-audit-test.log`.

## Remaining coverage limits

The deletion request lifecycle was not exercised. Invitation sending and admin report/media mutations were not changed in this feature pass; they remain covered only to the level noted by the parallel audits. The execution kill switch stayed enabled by instruction. The S3/S4 and course/lesson audit evidence should be read alongside this report for the remaining journeys.
