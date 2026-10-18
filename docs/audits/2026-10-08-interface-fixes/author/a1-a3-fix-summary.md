# Author A1–A3 Interface Fix Summary

**Date:** 2026-10-08  
**Scope:** A1 (New course modal lifecycle & reentry route guard), A2 (Filter tab query composition & literal encoding), A3 (Same-document skip link navigation)

---

## 1. Summary of Changes

### A1: Modal Lifecycle & Stale Reentry Route Guard
- **Files Modified:**
  - `packages/web/src/pages/author/AuthorCoursesPage.ts`: Wrapped modal overlay in a native `<dialog id="new-course-dialog" open class="modal-backdrop dialog-overlay" ...>` with inner `.modal-dialog.author-modal-440`.
  - `packages/web/src/main.ts`:
    - Added `activeRouteLifecycle` generation counter incremented on every `renderApp()`.
    - Captured `submitLifecycle = activeRouteLifecycle` and `submittedForm` on submission.
    - Bound course creation callback resolution (both success and error) to:
      1. `activeRouteLifecycle === submitLifecycle` (invalidated on any route departure, including Back→Forward reentry).
      2. `submittedForm.isConnected` (invalidated if the mounted form DOM node was unmounted).
      3. `modalInstanceId === submitInstance` (invalidated if modal was closed/reopened).
      4. `s2Current(path) && window.location.pathname === '/teach'`.
    - Prevented stale callbacks from redirecting to `/teach/:id/content` after native Back to `/learn` or subsequent Forward to `/teach`.
    - Native `Tab` / `Shift+Tab` focus containment trapped within `.author-modal-440`.
    - Native `Escape` key closes modal and returns focus to the opener trigger element (`[data-action="open-new-course-modal"]`).
    - Handled background `inert` states during modal presentation with proper cleanup on dismissal or navigation.

### A2: Query Filter Composition & Literal Special Character Encoding
- **Files Modified:**
  - `packages/web/src/pages/author/AuthorCoursesPage.ts`:
    - In `buildAuthorFilterUrl`, omitted default `status=all` parameter so URLs canonically format as `/teach?search=...`.
    - Separated `rawSearchQuery` from `safeTemplateData(opts)` before HTML attribute interpolation.
    - Preserved raw search string in `URLSearchParams`, preventing double HTML entity encoding (`&amp;` / `&quot;`) in URL query parameters.
    - Interpolated escaped query in HTML attributes (`value="${escapeHtml(rawSearchQuery)}"`) and text nodes.
  - `packages/web/tests/author-a1-a7-interface-fixes.test.ts`:
    - Updated stale test expectations from `/teach?status=all&search=Python` to canonical `/teach?search=Python`.
    - Added assertions for raw literal special queries (`Python & loops + "quoted"`) across URL builder, status filter tabs, and search input value escaping.

### A3: Same-Document Skip Link Navigation
- **Files Modified:**
  - `packages/web/src/components/shells/AppShell.ts`: Added `tabindex="-1"` to `<main id="main-content">`.
  - `packages/web/src/main.ts`: In the global click interceptor, intercepted same-document fragment links (`rawHref.startsWith('#')` or `target.hash && target.pathname === window.location.pathname`), calling `e.preventDefault()`, setting focus to the target element (`targetElem.focus()`), and returning without invoking SPA `navigateTo()`. Preserved focus movement into main content on subsequent Tab key without remounting or creating arbitrary history entries.

---

## 2. Verification Evidence

### Independent Audit Probes (Headless Chrome + CDP Native Keys/History)
- `/tmp/zur-independent-fix-audit/author-create-reentry.ts`:
  - Result: `passed: 1, failed: 0`
  - Check: `A1 stale create acknowledgement respects actual Back and Forward Teach reentry`
- `/tmp/zur-independent-fix-audit/author-create-pending.ts`:
  - Result: `passed: 1, failed: 0`
  - Check: `A1 pending create acknowledgement respects actual native Back destination`
- `/tmp/zur-independent-fix-audit/author-modal-lifecycle.ts`:
  - Result: `passed: 3, failed: 0`
  - Checks:
    1. `A1 new-course modal contains native keyboard focus and Escape returns trigger`
    2. `A1 rapid Cancel and reopen preserves owned dialog; native Back cleans inert state`
    3. `A7 Copy prompt never claims success on actual clipboard rejection`
- `/tmp/zur-independent-fix-audit/author-focused-a1-a3.ts`:
  - Result: `passed: 4, failed: 0`
  - Checks:
    1. `A3 one main and skip target`
    2. `A1 title retained after controlled create failure`
    3. `A2 search and status remain combined through history/reload`
    4. `A2 encoded search remains literal across status links`

### Targeted Renderer Test Suites
- Command: `node --experimental-strip-types --test packages/web/tests/author-a1-a7-interface-fixes.test.ts packages/web/tests/author-pages.test.ts packages/web/tests/author-redesign.test.ts`
- Result: **36 passed, 0 failed** (100% passing across all 3 suites).
