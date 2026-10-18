# Learner Supplement Coverage & Experimental Validation

**Audit Date**: 2026-10-06  
**Auditor**: Codex Lead External Reviewer (gemini-3.8-flash-high)  
**Supplement Captures**: 11 fresh desktop screenshots (1440×900)  
**Directory**: `screenshots/interface-review-2026-10-06/learner/`  
**Supplement Manifest**: [learner-supplement-manifest.json](learner-supplement-manifest.json)  
**Supplement Log**: [learner-supplement-log.json](learner-supplement-log.json)  

---

## 1. Experimental Validation of Prior Unresolved Checks

### Check 1: Trusted CDP Keyboard Focus Trap on Exercise Report Dialog
- **Method**: Real Chrome CDP `Input.dispatchKeyEvent` events (`keyDown` and `keyUp`, `windowsVirtualKeyCode: 9`, `key: 'Tab'`) dispatched directly to the active browser window.
- **Initial State**: Dialog opened via `.report-issue-link`; initial focus placed correctly on `TEXTAREA#report-issue-details`.
- **Observed Progression**:
  - Tab 1: Focus to `#report-include-code` checkbox.
  - Tab 2: Focus to `#submit-report-btn` submit button.
  - Tab 3: Focus to `#cancel-report-btn` cancel button.
  - Tab 4: Focus escaped dialog entirely to `BODY` and background page controls (`insideDialog: false`).
- **Conclusion**: **Confirmed Defect**. The `#exercise-report-dialog` handles `Escape` key to close, but lacks a Tab/Shift+Tab focus trap listener, and outer workspace elements lack `inert` / `aria-hidden` while the dialog is open.
- **Evidence**: `learner-p15-python-report-modal-tab-escape-focus.png`, Supplement Log #1.

---

### Check 2: Native Browser Back on Dirty Profile Form
- **Method**: Navigated from `/learn` to `/settings/profile` via SPA link. Modified `#profile-display-name` to `"Ada Modified Name Draft"`. Dispatched native CDP `Page.navigateToHistoryEntry` targeting the prior `/learn` entry.
- **Observed Behavior**:
  - Browser Back navigated immediately to `/learn` (`title: "ZUR — Understand it. Then write it."`) without rendering any unsaved changes confirmation dialog.
  - Navigating forward back to `/settings/profile` revealed the form input was reset to `"Ada Lovelace"` (draft lost: `draftRetained = false`).
- **Conclusion**: **Confirmed Defect**. `packages/web/src/main.ts:5038` `popstate` listener only invokes `confirmAppearanceDeparture`, omitting `ProfileGuard` / dirty form checks. Native browser Back discards profile updates silently.
- **Evidence**: `learner-p17-profile-dirty-back-discarded.png`, Supplement Log #2.

---

### Check 3: SPA In-Page Task Navigation vs Full Document Reload Sidebar State
- **Method**: Collapsed sidebar on step 4 (`step-4-python-echo`). Clicked task square 5 (`step-5-waived-theory`) directly within the task strip (SPA client-side click without full page navigation).
- **Observed Behavior**:
  - Sidebar remained collapsed (`isCollapsedAfterSpaClick = true`).
  - *Comparison with prior test*: Full document reload / URL navigation (`Page.navigate` / reload) remounts the shell and resets sidebar to expanded because state is not stored in `sessionStorage` (defect L3). However, in-page SPA clicks on the task strip retain the DOM `.collapsed` class.
- **Evidence**: `learner-p12-sidebar-spa-nav-reset.png`, Supplement Log #3.

---

## 2. Controlled Adverse Catalog States Coverage Table

| Route | State Inspected | Theme | Viewport | Fault Simulation Type | Status | Evidence File |
|---|---|---|---|---|---|---|
| `/courses` | Authenticated Explore Loading Skeleton | Dark | 1440×900 | Controlled delay 4000ms on `/api/courses/catalog` | **Compliant** | `learner-p02-explore-auth-dark-loading.png` |
| `/courses` | Authenticated Explore Loading Skeleton | Light | 1440×900 | Controlled delay 4000ms on `/api/courses/catalog` | **Compliant** | `learner-p02-explore-auth-light-loading.png` |
| `/courses` | Authenticated Explore Service 500 Error | Dark | 1440×900 | Controlled 500 HTTP response on `/api/courses/catalog` | **Compliant** | `learner-p02-explore-auth-dark-error.png` |
| `/courses` | Authenticated Explore Service 500 Error | Light | 1440×900 | Controlled 500 HTTP response on `/api/courses/catalog` | **Compliant** | `learner-p02-explore-auth-light-error.png` |
| `/courses?q=nomatchqueryxyz12345` | Catalog Empty Search Query Result | Dark | 1440×900 | Valid search with 0 matches | **Compliant** | `learner-p02-explore-auth-dark-no-matches.png` |
| `/courses?q=nomatchqueryxyz12345` | Catalog Empty Search Query Result | Light | 1440×900 | Valid search with 0 matches | **Compliant** | `learner-p02-explore-auth-light-no-matches.png` |
| `/courses/nonexistent-course-id-999` | Course Overview Not Found / Unavailable | Dark | 1440×900 | HTTP 404 on course ID | **Compliant** | `learner-p03-course-overview-auth-dark-error.png` |
| `/courses/nonexistent-course-id-999` | Course Overview Not Found / Unavailable | Light | 1440×900 | HTTP 404 on course ID | **Compliant** | `learner-p03-course-overview-auth-light-error.png` |

---

## 3. Summary of Learner Supplement Findings
1. Focus trap defect on `#exercise-report-dialog` is independently confirmed using native CDP key events.
2. Silent draft loss on browser Back for `/settings/profile` is independently confirmed using native history entries.
3. Sidebar collapse persistence is confirmed lost across document reload/return, but retained during in-page SPA task strip clicks.
4. Authenticated catalog loading, 500 error, 0-match query, and course overview 404 error states are verified and captured across both light and dark themes. All preserve the authenticated application sidebar and offer actionable retry/recovery actions.
