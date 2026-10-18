# Admin workspace provisional plan

Reviewed 2026-10-06 against commit 0998ec0. Analysis only; all changes below are **Proposed**. 36 fresh screenshots captured across P32–P39 and moderation dialogs in both light and dark themes; inspected against route contract, live CDP fixtures, and current admin rendering code. Screenshot root: `../../../screenshots/interface-review-2026-10-06/admin/`. Exact state records: [admin-manifest.json](admin-manifest.json); [admin-coverage.md](admin-coverage.md).

Selected prior recommendations: focused administrative confirmations, truthful system status, preserved justification context on reauthentication failure, clear blast radius warnings, and accessible keyboard focus management in `<dialog>` elements.

---

## AD1 — Retain audit justification text and focus on reauthentication failures

**Confirmed compliant pattern; P1; Proposed / Retain.** Routes `/admin/users/:userId` and `/admin/courses/:courseId`; evidence [suspend user error](../../../screenshots/interface-review-2026-10-06/admin/admin-p33-dialog-suspend-user-error-dark.png), [manage roles error](../../../screenshots/interface-review-2026-10-06/admin/admin-p33-dialog-manage-roles-error-dark.png), [course availability error](../../../screenshots/interface-review-2026-10-06/admin/admin-p34-dialog-course-availability-error-dark.png).

All administrative mutation dialogs requiring reauthentication (`currentPassword`) correctly preserve the entered `reason` string in the DOM when an authentication failure occurs. This avoids forcing administrators to retype detailed incident explanations or policy citations.

Retain this preservation behavior across all existing and future administrative dialog forms. Ensure that upon rejection, focus is automatically moved to the password input field with `aria-invalid="true"` and an associated `aria-describedby` linking to the error message. Components: `packages/web/src/pages/admin/AdminPages.ts` dialog handlers.

Acceptance: enter justification text → submit with wrong password → verify reason text remains intact, error banner is announced, and password field receives focus. Required after captures: error dialogs in dark and light at 1440×900.

---

## AD2 — Enforce live enrollment impact preview before enabling progression waiver submit

**Confirmed compliant guard; P2; Proposed / Retain.** Route `/admin/courses/:courseId`; evidence [progression waiver preview](../../../screenshots/interface-review-2026-10-06/admin/admin-p34-dialog-course-waiver-preview-dark.png).

The Course Progression Waiver modal implements a strict two-phase interaction:
1. The submission button is initially disabled.
2. The administrator must explicitly select a target version and step from the dropdown.
3. The interface immediately computes and displays the exact count of affected active enrollments and displays the immutable version scope notice.

Only once the affected impact is displayed does the confirmation CTA enable. This prevents accidental course-wide progression waivers.

Retain this guard. Ensure that if the step selection changes back to the empty prompt or a calculation error occurs, the submission button immediately disables. Components: `packages/web/src/pages/admin/AdminPages.ts` waiver modal scripts.

Acceptance: open waiver dialog → verify submit disabled → select step → verify live count renders and submit enables → deselect → verify submit disables.

---

## AD3 — Clarify execution pause scope in operational alerts

**Confirmed compliant design; P2; Proposed / Retain.** Route `/admin/execution`; evidence [execution pause dialog](../../../screenshots/interface-review-2026-10-06/admin/admin-p38-execution-dialog-dark.png) and status header (`admin-p38-execution-dark-normal.png`).

The execution pause dialog and status pill distinguish between code runner ingestion and platform availability. When execution is paused, the UI clearly states that student code runner dispatch is stopped, while learner reading, authoring, and draft editing remain fully accessible.

Retain this clear communication of operational boundaries so administrators do not confuse a runner queue pause with a platform-wide outage. Components: `AdminPages.ts` execution tab.

---

## AD4 — Contain keyboard focus within native `<dialog>` elements during administrative actions

**Confirmed architectural standard; P1; Proposed.** Shared across all admin dialogs (P33, P34, P35, P38); evidence [category edit dialog](../../../screenshots/interface-review-2026-10-06/admin/admin-p35-category-edit-dialog-dark.png), [execution dialog](../../../screenshots/interface-review-2026-10-06/admin/admin-p38-execution-dialog-dark.png).

Admin dialogs leverage native HTML `<dialog>` elements via `dialog.showModal()`. This natively traps focus within the dialog in modern browsers and enables background inertness. On close or Escape, `lastActiveAdminTrigger` restores focus to the invoking button.

Ensure all admin dialog implementations consistently use native `<dialog>` rather than custom `<div>` overlays, ensuring full compatibility with assistive technologies and native Escape handling. Components: `packages/web/src/main.ts` and `AdminPages.ts`.
