# Admin plan

Analysis only; current commit `0998ec0`; all changes **Proposed**. Written after author plan/coverage, before inspecting public/account screenshots. Selected recommendations: focused confirmations, target/effect disclosure, preserved recovery inputs, truthful telemetry, useful exits. Historical recheck is supporting evidence only; current fresh normal/detail and category dialog screenshots were inspected against `AdminPages.ts` and native `showModal()` handlers in `main.ts`.

## D1 — Separate category editing from removal

**P2, design judgment; principles 1, 2, 15.** `/admin/categories`. Fresh `admin-p35-category-edit-dialog-dark.png` shows one long scrollable dialog containing rename and removal forms, each with reason/password controls. Save and removal form compete in the same task; removal requires a raw replacement-category ID. Source confirms both forms and free-text ID input.

Retain category list, usage count, rename, administrator reauthentication, backend reassignment constraints and inline errors. Make Edit a short rename dialog; expose Remove as a separate secondary action opening a focused confirmation. Show the named category, usage count, affected courses and proposed result. Offer eligible replacement categories by readable name with IDs as supporting information; exclude current category and validate server-side. Keep removal disabled until required reassignment is valid. Never bypass audit/reason/password requirements. Change category renderer in `AdminPages.ts` and corresponding dialog handlers in `main.ts`; reuse existing native dialog lifecycle rather than introducing another overlay.

Acceptance: keyboard open/close/Tab/Escape returns focus correctly; rename needs no removal scrolling; cancel produces no mutation. Removal with zero usage and with required reassignment, stale replacement, invalid reauthentication and network failure gives truthful outcomes and retains nonsecret inputs. Success refreshes actual usage and audit receipt. Required after captures: rename; remove with readable replacement; failure; acknowledged result in both themes at 1440×900 and narrow desktop. Do this after shared modal conventions S2, preserving native modal behavior.

## Retained structure and limits

User/course detail action rows already lead to focused native confirmations. Fresh platform status distinguishes unavailable telemetry from observed zero errors. Detail pages have list exits, immutable snapshot links and persistent admin navigation. Do not add speculative redesign work for these pages. Historical successful suspension/restore/role/support/waiver receipts are not proof of current mutation journeys. Fresh category modal supports the design judgment; native keyboard behavior, backend mutation/recovery and actual support expiry remain unverified unless explicitly recorded in the final interaction inventory. No real administrative records were changed.
