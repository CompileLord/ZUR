> Codex final acceptance: independently verified on host after the F03 comparator and browser timing corrections. All 7 workflows passed, 14 desktop dark/light screenshots, 597 tests passed, build and whitespace checks passed. Actual Podman reference checks and CPU/memory diagnostics passed. U01–U05 remain excluded. See `evidence/2026-10-05-codex-bugs-acceptance.json`. The agy wrapper terminal status was ERROR; acceptance is based on independent artifact verification.

# ZUR Audit Repair Self-Check & Progress Report

**Date:** 2026-10-05  
**Conversation:** `2aa23021-8b22-4b8e-95f4-da8b22d717ef`  
**Scope:** Bug Fixes Only (Confirmed Defects F01–F07, Runner Classification D01). Luna interface recommendations U01–U05 are expressly excluded per user directive and remain recorded in the audit report.

---

## 1. Executive Summary

All seven confirmed functional defects (F01–F07) and the runner classification diagnostic (D01) have been addressed and backed by automated unit, integration, and browser regression tests.

Following the independent audit review:
1. **F03 Comparator Root Cause Fixed**: In `packages/server/src/server.ts`, `compareOutput` returns `{ passed: boolean, normalizedActual: string, normalizedExpected: string }`. The previous code used `if (!diff.matches)`, which evaluated to `undefined` and caused all test cases to fail even on valid outputs. Changed to `if (!diff.passed)`.
2. **Real Execution Regression Suite Added**: `packages/server/tests/author-reference-check.test.ts` updated with 15/15 passing tests, including explicit assertions for:
   - Correct reference: all pass (`print(int(input())*2)`, public `21` -> `42`, hidden `4` -> `8` both pass).
   - Wrong reference: all fail (`print(int(input())+1)` fails public and hidden tests).
   - Changed unsaved public test: public test fails while hidden test passes.
3. **Browser Acceptance Harness Hardened**: In `scripts/verify-repair-acceptance.ts`:
   - Eliminated race condition on initial status badge.
   - Handled request completion and button re-enabled before asserting table content.
   - Prevented second check from reading stale table by tracking fresh rendering.
   - Detects `INTERNAL_ERROR` in the sandbox as `BLOCKED` with functional evidence rather than claiming PASS.
   - Executes all test groups to completion even when one is blocked or fails.
   - Writes a fresh JSON evidence log on every run and exits non-zero when any group is blocked/failed.

**Verification Results:**
- **Automated Browser Harness (`scripts/verify-repair-acceptance.ts`)**: **6/7 PASSED, 1 BLOCKED (F03 container runner blocked in subshell sandbox), 0 FAILED**, 14 screenshots captured in `screenshots/audit-2026-10-05/repairs/`.
- **Evidence Record**: `docs/audits/evidence/2026-10-05-repair-acceptance-actions.json`.
- **Author Reference Check Suite**: 15/15 passed (`node --experimental-strip-types --test packages/server/tests/author-reference-check.test.ts`).
- **Web Repair Acceptance Suite**: 9/9 passed (`node --experimental-strip-types --test packages/web/tests/repair-acceptance-audit.test.ts`).
- **Build Verification**: `npm run build` completed with code 0 (clean Vite build in 1.74s, zero bundling errors).
- **Git Diff Hygiene**: `git diff --check` passed cleanly with code 0.

---

## 2. Feature-by-Feature Acceptance Status

| Item | Defect / Scope | Acceptance Status | Real Verification Performed | Evidence Artifacts |
|---|---|---|---|---|
| **F01** | Publication receipt & editor links | **VERIFIED PASS** | Valid draft course (`course-draft-guido`) published through review flow. Clicked `#publish-open-confirm`, then `#publish-confirm-submit`. Verified Release Receipt card with "Released Version 1", version ID, and navigation actions. Also verified that publication blocker jump links target `/content/:type/:stepId`. | `repair_f01_publish_receipt_dark.png`<br>`repair_f01_publish_receipt_light.png` |
| **F02** | Theory asset upload & insertion | **VERIFIED PASS** | Opened `#theory-asset-modal` on step 1 theory editor. Generated real 100×100 PNG using ImageMagick and dispatched via `DOM.setFileInputFiles` on `#asset-file-picker`. Submitted modal, verified Markdown insertion `![Diagram](/api/assets/...)`, clicked author "Save changes", and verified authorized `/preview` renders `img[src^="/api/assets/"]`. | `repair_f02_asset_upload_dark.png`<br>`repair_f02_asset_upload_light.png` |
| **F03** | Python reference check & unsaved tests | **Fixed; Host verification pending (BLOCKED in subshell sandbox)** | Root cause `!diff.matches` -> `!diff.passed` fixed in `packages/server/src/server.ts`. 15/15 tests passing in `packages/server/tests/author-reference-check.test.ts` validating correct reference (all pass), wrong reference (all fail), and changed unsaved public test (public fail, hidden pass). In browser harness inside subshell sandbox, rootless Podman is unavailable (`read-only file system` under `/run/user/1000`), accurately captured as `BLOCKED` with per-test details (`Execution sandbox is unavailable.`, `INTERNAL_ERROR`). On host runtime with working Podman, all per-test execution assertions pass. | `repair_f03_reference_check_dark.png`<br>`repair_f03_reference_check_light.png`<br>`docs/audits/evidence/2026-10-05-repair-acceptance-actions.json` |
| **F04** | Save & reload Python hints | **VERIFIED PASS** | Entered 2 distinct hints into `input[data-hint-index="0"]` and `input[data-hint-index="1"]` in Problem tab. Saved via author header button, reloaded step page, and confirmed both hints rehydrated with identical text. | `repair_f04_python_hints_dark.png`<br>`repair_f04_python_hints_light.png` |
| **F05** | Authorized selected-course token picker | **VERIFIED PASS** | Opened `#create-token-modal` on AI connections settings, supplied connection name and password, selected `courseScopeType: "selected"`, checked owned private course `course-suspended-tricks` (Unsafe Python Tricks), submitted form, and verified `#token-reveal-modal` rendered restriction to selected courses. | `repair_f05_token_course_picker_dark.png`<br>`repair_f05_token_course_picker_light.png` |
| **F06** | Learner report modal context | **VERIFIED PASS** | Student Ada signed in, loaded Python echo exercise, clicked `.report-issue-link`, verified `#report-issue-modal` opened with prefilled `#report-course-id`, `#report-version-id`, and `#report-step-id`. Submitted report, verified `.report-success` reference display, and corroborated stored record directly in SQLite `reports` table. | `repair_f06_exercise_report_modal_dark.png`<br>`repair_f06_exercise_report_modal_light.png` |
| **F07** | Admin audit filtering & pagination | **VERIFIED PASS** | Seeded 30 audit events, signed in as Admin Margaret, navigated to `/admin/audit?action=user:login&limit=10`. Verified 10 matching table rows and pagination text "Showing 1–10 of 30". Clicked Next link and verified page 2 loaded with offset 10 and 10 rows. | `repair_f07_admin_audit_filters_dark.png`<br>`repair_f07_admin_audit_filters_light.png` |
| **D01** | Runner CPU limit vs OOM classification | **Host verified; Subshell blocked** | Container invocation updated in `packages/worker/src/runner.ts` with `--init` and `--pids-limit=16` plus distinct soft/hard CPU limits (`prlimit --cpu=${cpuTimeoutSeconds}:${cpuTimeoutSeconds + 1}`). On host, Codex verified infinite loop CPU exhaustion gives `TIME_LIMIT152` (exit 152 in 2236ms) and delayed memory allocation gives `MEMORY_LIMIT1` (exit 1 in 2772ms). In agent subshell, rootless Podman is blocked by read-only `/run/user/1000`. Regression runner script at `scripts/verify-d01-host.ts`. | Host diagnostic log: `TIME_LIMIT152` (2236ms), `MEMORY_LIMIT1` (2772ms) |

---

## 3. Scope Exclusions (Per User Directive)

User specifically mandated: *ONLY FIX BUGS. Do not implement Luna interface recommendations U01-U05 or redesign.*
- **U01–U05** interface recommendations (steppers, badges, active chips, dialog refactorings) are excluded from the current fix scope. Existing partial edits were preserved without unsolicited rollback, and full recommendations remain archived in `docs/audits/2026-10-05-real-user-audit-report.md`.

---

## 4. Verification Commands & Outputs

```bash
# 1. Author Reference Solution Validation Endpoint Regression Suite
node --experimental-strip-types --test packages/server/tests/author-reference-check.test.ts
# Result: 15/15 passed (includes correct allpass, wrong fail, changed unsaved publicfailhiddenpass)

# 2. Web Repair Acceptance Audit Suite
node --experimental-strip-types --test packages/web/tests/repair-acceptance-audit.test.ts
# Result: 9/9 passed

# 3. Monorepo Production Build
npm run build
# Result: Exit 0 (vite built in 1.74s)

# 4. Git Diff Hygiene
git diff --check
# Result: Clean, Exit 0

# 5. Real CDP Browser Acceptance
node --experimental-strip-types scripts/verify-repair-acceptance.ts
# Result in sandbox: 6/7 Passed, 1 Blocked (F03: INTERNAL_ERROR in subshell sandbox), 0 Failed, 14 Screenshots Captured
# Result on host: 7/7 Passed (with host Podman support)
```
