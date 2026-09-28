# S4 audit — in progress

Reviewed against `PRD_V2.md` §§3–4, 14–16, 18–20, `design.md` P02/P32/P34/P36 and the S4 gate in `tasks.json`. The three confirmed defects in tasks marked done are closed on local source, test, and real-browser evidence. This does not close the Phase C pilot gate.

| Finding | Verified result |
|---|---|
| T070 — P02 content-language filter | The public catalog API returns languages from published, publicly listed courses. Desktop and mobile controls offer those languages. A real browser selected Spanish, preserved `?language=es`, and displayed the one published Spanish course. Unpublished/private languages are excluded by the catalog query. |
| T077 — P32 internal-error rate | The overview now uses a platform HTTP server-error rate: observed 5xx responses divided by buffered requests over an explicit five-minute in-memory window. A 4xx is excluded from the numerator; zero samples display `Unavailable` with the restart limit stated. The request buffer is capped at 10,000 samples, so this is process-local recent telemetry. Execution infrastructure failures remain a separate 24-hour count. Tests cover zero, 4xx, and 5xx samples; the browser showed the rate and window. |
| T081 — P36 exact reported version | The report link resolves the retained immutable course version and reported step under admin authorization. A real browser followed a Version 1 report while Version 2 was latest and saw Version 1's step problem statement and starter code. Missing snapshot data renders an unlinked unavailable state. The desktop and 390px support view were visually inspected and the step is visible above the fold on mobile. |

## Independent checks

- S4 targeted server/web/operational tests: **73 passed, 0 failed**.
- `npm run build`: **passed** (Vite bundle-size advisory only).
- `git diff --check`: **passed**.
- `SCREENSHOTS_DIR=/tmp/zur-s4-audit-captures node --experimental-strip-types scripts/verify-s4-browser-journey.ts`: **passed all six live browser journeys** with local SQLite, API server, Vite, Chrome, real route navigation, authentication, and click events.
- Visual inspection: `/tmp/zur-s4-audit-captures/s4_journey_p02_mobile_spanish.png`, `s4_journey_p32_admin_overview.png`, `s4_journey_p36_report_detail.png`, `s4_journey_p36_report_unavailable.png`, and `s4_journey_p34_mobile.png`. Captures remain outside the repository to respect the user's screenshot cleanup.
- Full `npm test` is **not green** after that cleanup: the final independent run executed 539 tests, with 526 passing and 13 failing because tracked screenshot evidence files were removed. All 13 are S1/T087 evidence-file checks, not failures in the three S4 product fixes. The deleted assets were not restored.

## Remaining S4 gate work

- **T072 blocked:** launch-approved Privacy and Terms content and contextual support/reporting decisions remain external.
- **T086 blocked:** human screen-reader and native forced-colors review remains required; DevTools emulation is insufficient.
- **T087 in progress:** viewport, adverse-state, keyboard, and actual 200% zoom coverage is incomplete. The screenshot cleanup also removed previously linked visual evidence, causing the evidence tests noted above to fail. Recreate or formally replace that evidence before claiming this task done.
- **T088 blocked:** external alert delivery and staging restore, rollback, runner-shutdown, and incident drills need deployment infrastructure.
- **T089 blocked:** isolated pilot environment, agreed baseline conditions, 100 concurrent sessions, and production-like runner load evidence are unavailable.

S4 and M01/M04 remain **in progress**. M02 and M03 are still marked done in `tasks.json`; this pass independently revalidated only the three findings above, not every earlier done claim in those modules. Do not declare S4 complete from these fixes or passing targeted tests.
