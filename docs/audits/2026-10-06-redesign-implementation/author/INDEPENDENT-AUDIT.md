# Independent author acceptance audit — 2026-10-06

## Decision

Accept the corrected core author implementation for the verified scope below. Do not accept the original plan as fully complete. Agent completion claims were rejected until independent checks passed. The latest same-conversation agy correction failed with an empty response and a network timeout; Codex made the final corrections locally. This is artifact acceptance, not a successful executor result.

## Findings and fixes

| Finding | Result |
|---|---|
| Preview initializer was not called by the real app; clipboard could claim success on failure | Explicit initializer wired after mount; inline duplicate handlers removed; exact authored clipboard text and truthful failure feedback verified |
| Python preview placed its nested split inside one grid column, leaving most of the page blank | Split panes now occupy the shared learner grid; desktop editor width and right-edge assertions pass; preview fits below its banner |
| Preview links opened the first course step and could discard unsaved edits | Links select the edited step; dirty navigation saves before leaving; failed save stays in the editor; edits during an in-flight save remain dirty |
| Preview sidebar button and previous/next arrows were inert | Sidebar collapse/expand and adjacent-step navigation work and are checked in the browser |
| Publication harness assumed live validation must return three infrastructure errors | Actual unmodified validation passed on this machine; three-error UI now uses an explicitly controlled fixture. Retry calls the validation service again. No production failures are fabricated |
| Student reinstatement claim only clicked an absent optional button | Test now performs real revoke and reinstate in the ephemeral database and checks persisted status plus unchanged pinned version |
| Receipt check could pass on an already-existing version; progress check only counted rows | Receipt must match newly created next SQLite version; preview progress and assessment rows must remain exactly unchanged |
| Recent changes showed an empty course-tree placeholder | Removed the unused tree from this page |

## Independent verification

- Eight author browser workflow groups pass: all four editor dirty/save/failure/retry/persistence flows; Python tabs and Tests deep link; dirty-preview-save failure and recovery; grouped validation and all three Edit-tests destinations; validation retry and receipt; all four preview types, copy success/failure, sidebar/arrows and zero progress changes; real student revoke/reinstate and detail; remaining author screens load.
- Live CourseValidationService returned isValid=true with no errors for the saved fixture draft. Blocking infrastructure UI and receipt publication use explicitly labeled controlled validation fixtures. Publication itself creates the next release in ephemeral SQLite; no real course was published.
- Web tests: 294/294 pass. Production build and whitespace check pass.
- 36 fresh app screenshots: 18 states × dark/light, desktop 1440×900 only. Reviewed author group contact sheets plus full-size editor, publication, preview and activity captures. Video embedding is verified structurally, not as successful third-party playback.
- [Browser log](independent-audit/browser-workflows.log), [tests](independent-audit/web-tests.log), [build](independent-audit/web-build.log), [manifest](independent-audit/manifest.json), [agy failure](independent-audit/agy-correction-failure.log).
- [Before/after comparison](../author-audit-comparison.html).

## Remaining original-plan requirements

| Pages / requirement | Status |
|---|---|
| Author dashboard, course tree and management layouts | Core visual changes accepted; filter/scroll restoration, large-data behavior and full builder mutation/reorder journey remain unverified |
| Theory/video/quiz/Python editors | Save/error/retry accepted. Tree stays visually consistent but route navigation still replaces markup. Collapsible inspector, complete keyboard tree navigation, measured transition performance and all long-content cases remain partial |
| Python student preview | Corrected usable split accepted as a read-only approximation; it still does not reuse the entire interactive learner editor or execute preview code |
| Video player | Valid embedded-player markup accepted; unavailable/blocked/slow-provider states and actual external playback remain unverified |
| Publication | Grouping, deep links, retry and controlled receipt integration accepted; receipt run does not prove release validation with an unavailable real runner |
| Students | Revoke/reinstate persistence accepted; invitation lifecycle, roster return-state restoration, pagination and all student attempt selection cases remain unverified |
| Analytics/settings/activity | Rendered seeded states accepted. Full metric selector behavior, metadata/lifecycle saves and activity restore/conflict journeys remain unverified |
| AI connections/setup | Captured existing account-settings pages only; token creation/revocation/verification and associated redesign remain outside this author acceptance scope |

These are explicit remaining items, not reasons to keep the completed audit pending.
