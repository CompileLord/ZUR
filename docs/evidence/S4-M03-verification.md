# S4-M03 verification evidence

Implemented the administration and private support surfaces in `design.md` P32–P39, with privacy export/deletion follow-through from P20 and PRD §15.

## Verification

- `npm test`: 441 tests passed, 0 failed (re-run after final changes before marking tasks complete).
- `npm run build`: Vite production build passed.
- `git diff --check`: passed.
- `node --experimental-strip-types scripts/capture-s4-m03-screenshots.ts`: headless Chrome captures generated in `screenshots/`.
- Screenshots visually inspected at desktop and 390px mobile. The admin shell and account shell use responsive horizontal navigation; the deletion modal is hidden until explicitly opened.

## Screenshots

- P32 operations overview: `screenshots/s4_m03_overview.png`, `screenshots/s4_m03_overview_mobile.png`
- P33 user administration/support: `screenshots/s4_m03_users.png`, `screenshots/s4_m03_users_user_student_1.png`
- P34 course administration/waiver: `screenshots/s4_m03_courses.png`, `screenshots/s4_m03_courses_course_python_foundations.png`
- P35 categories: `screenshots/s4_m03_categories.png`
- P36 report triage: `screenshots/s4_m03_reports.png`, `screenshots/s4_m03_reports_report_screen.png`
- P37 media review: `screenshots/s4_m03_media.png`
- P38 execution operations: `screenshots/s4_m03_execution.png`
- P39 audit search: `screenshots/s4_m03_audit.png`
- Privacy export status/download: `screenshots/s4_m03_privacy_export.png`, `screenshots/s4_m03_privacy_export_mobile.png`

## Security and behavior coverage

- Admin APIs require an active administrator. Sensitive mutations require the current password and an 8–1000 character reason; mutations and private-record views write audit events.
- Learner attempt history/detail and execution job payload access require an active, student/course-scoped support grant. Grants expire after 30 minutes and can be revoked.
- Waivers require a selected immutable version and required step, recheck the affected enrollment count, set waiver provenance, and never create a passing attempt.
- Media previews are no-store, reason-audited image responses. Deletion requires quarantine and zero retained version/draft references.
- Audit search includes agent mutation metadata while excluding prior/new content, learner code, secrets, and hidden test details.
- User exports contain a JSON bundle in a ZIP with a 24-hour authenticated download. The account owner can download it from Privacy settings; other users receive a safe not-found response.
- Deletion waits 30 days, stores ownership blockers, supports audited archival for a pending deletion request, scrubs identity, revokes credentials, removes drafts, and records the backup re-deletion marker.

T072 remains blocked as directed. No commit was created.

## First audit corrections

- Execution pause now applies to `author_validation` as well as learner job kinds; the validation path does not bypass the global kill switch. Regression coverage asserts a paused server rejects author validation with 503.
- Admin audit reasons are scrubbed before being written and again when legacy rows are listed or opened. Tests cover credentials, email addresses, and fenced code in stored reasons, plus legacy unsanitized rows.
- Support grants now expose learner records only through the dedicated support records endpoint, which returns the reason and expiry for the visible banner. Generic course, attempt, and execution-job detail authorization no longer accepts a support grant. Tests assert the generic views are denied and the banner payload contains reason and expiry.
- Verification after corrections: `npm test` (441 passed, 0 failed), `npm run build` (passed), `git diff --check` (passed). No UI changed, so existing screenshots remain current.

## Second audit correction: inline code in reasons

Reason sanitization now replaces the entire reason with a fixed summary when it detects inline backticks, `print(...)`, or assignment expressions such as `x = 2`, in addition to fenced and multiline code. Regression coverage checks storage, list/detail responses, and legacy raw audit rows for both `x = 2` and `print(2)`.

Reverification: `npm test` (441 passed, 0 failed), `npm run build` (passed), and `git diff --check` (passed).
