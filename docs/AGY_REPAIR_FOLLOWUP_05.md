Continue SAME conversation. Model gemini-3.1-pro-high selected after repeated concrete quality failures: previous Flash work claimed browser actions without executing them. User explicitly wants implementation through agy and desktop1440x900 DARK and LIGHT only. No old S4 scripts/zoom/mobile capture workflow. Do not resurrect removed scripts.

Goal: finish actual desktop functional coverage and product fixes. Read plan and acceptance audit. Avoid endlessly broadening work; execute listed missing actions, assert state/results, fix demonstrated defects.

## Round 4 acceptance audit

Root full npm test **569/569 pass**, zero skips; build and diff whitespace pass. Authorized obsolete S4 scripts and phase-specific matrix removed. New desktop-only script/test exist. User scope correction accepted. R02 desktop scope accepted provisionally; R03 production initial reduction verified.

Remaining concrete defects in browser evidence:
- Journey4 never clicks Run or Submit, only checks elements exist. It sets code with literal backslash-n sequences, so code is not executable Python. After reload it only logs restored code without assertion. Custom stdin not executed/asserted.
- Journey5 cancels confirmation dialogs, never submits deletion, cancels a pending request, restores account or revokes sessions. Screenshot named deletion_pending actually shows confirmation dialog.
- Journey6 only views kill-switch card, never disables/re-enables execution; verification uses invalid token and merely renders error page. Reports/media/password reset actions absent.
- editor-lazy-loading.test.ts tests copied miniature mock logic, not real application code; does not verify actual imports. Replace with browser interception regression or tests executing extracted production helper. No mimic tests.
- Some views only dark, while desktop evidence should cover both themes. New captures should use current descriptive names rather than old s4 phase names. Desktop dimensions remain1440x900.

Do not claim complete until real browser actions/results asserted and evidence saved. Existing snapshot/transaction unit tests and build are good. Root independently completed worker tests; do not call sandbox restriction a product blocker.

Implement production-connected tests, not duplicate toy logic. In reusable scripts/verify-browser-journeys.ts: actual module/lesson/step reorder controls and reload assertions; actual editor input with newlines, click run samples/custom and submit, assert completed output/verdict + request payload/draft reload equality. CDP Fetch interception can delay/fail lazy CodeMirror import and then navigate to prove fallback/stale mounting behavior. Use separate fresh contexts to avoid module cache. Actual deletion/cancel/restore, real single/all-session revocation, report resolve/media quarantine restore, kill-switch pause/re-enable and attempted execution rejection, local valid verification/reset token lifecycle through forms. Safe isolated fixture DB/user setup allowed; assertions after action via API/DB okay. Execute all possible in sandbox. For actual runner probe needing host, implement correct worker launch and provide root exact command; return remaining host-required execution distinctly, not as done. Save structured evidence JSON and both-theme desktop screenshots for major views, no secrets in evidence. Tests remain meaningful; full npm test already569/569 on host. Keep source only edited by you.

No external SMTP/video provider assertions; local fixture flows only. Correct report to distinguish UI/API/service evidence. Finish all feasible gaps then give exact root verification commands, changedfiles, actualoutcomes and limitations.
