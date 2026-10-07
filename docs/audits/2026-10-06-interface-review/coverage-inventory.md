# Route and state coverage inventory

Source: `packages/web/src/router/routes.ts`; 55 page definitions, 52 distinct route patterns. Every individual capture has its route, theme, viewport, timestamp and fixture in [capture manifest](capture-manifest.json). All 167 files fully decode; [verification](image-verification.json) records dimensions and hashes. Images are saved locally under `screenshots/interface-review-2026-10-06/` and are ignored by Git.

This is a presentation inventory, not a whole-interface pass. Normal, empty, loading, error, success, selected, completed, expanded/collapsed, long-content and modal states in each theme are **unverified unless explicitly listed by a capture or checked interaction**. A capture alone does not establish the associated mutation, navigation, keyboard behavior or backend result. Narrow desktop coverage is limited to the captured learner workspace; other narrow layouts remain unverified.

| Page / route pattern | Captured frames / themes | Evidence |
|---|---|---|
| P01 `/` | 4 / dark, light | `public-p01-landing-dark-normal.png`<br>`public-p01-landing-dark-normal__full.png`<br>`public-p01-landing-light-normal.png`<br>`public-p01-landing-light-normal__full.png` |
| P02 `/courses` | 12 / dark, light | `learner-p02-explore-auth-dark-with-sidebar.png`<br>`learner-p02-explore-auth-dark-filtered.png`<br>`learner-p02-explore-auth-dark-loading.png`<br>`learner-p02-explore-auth-light-loading.png`<br>`learner-p02-explore-auth-dark-error.png`<br>`learner-p02-explore-auth-light-error.png`<br>`learner-p02-explore-auth-dark-no-matches.png`<br>`learner-p02-explore-auth-light-no-matches.png`<br>`public-p02-catalog-dark-normal.png`<br>`public-p02-catalog-light-normal.png`<br>`public-p02-catalog-dark-filtered.png`<br>`public-p02-catalog-dark-empty.png` |
| P03 `/courses/:courseId` | 8 / dark, light | `learner-p03-course-overview-auth-dark-normal.png`<br>`learner-p03-course-overview-auth-dark-normal__full.png`<br>`learner-p03-course-overview-auth-dark-error.png`<br>`learner-p03-course-overview-auth-light-error.png`<br>`public-p03-course-overview-dark-normal.png`<br>`public-p03-course-overview-dark-normal__full.png`<br>`public-p03-course-overview-light-normal.png`<br>`public-p03-course-overview-light-normal__full.png` |
| P04 `/sign-in` | 3 / dark, light | `public-p04-sign-in-dark-normal.png`<br>`public-p04-sign-in-light-normal.png`<br>`public-p04-sign-in-dark-error.png` |
| P05 `/sign-up` | 3 / dark, light | `public-p05-sign-up-dark-normal.png`<br>`public-p05-sign-up-light-normal.png`<br>`public-p05-sign-up-dark-error.png` |
| P06 `/verify-email` | 3 / dark, light | `public-p06-verify-email-dark-direct.png`<br>`public-p06-verify-email-dark-context.png`<br>`public-p06-verify-email-light-context.png` |
| P07 `/forgot-password` | 3 / dark, light | `public-p07-forgot-password-dark-normal.png`<br>`public-p07-forgot-password-light-normal.png`<br>`public-p07-forgot-password-dark-submitted.png` |
| P07 `/reset-password` | 2 / dark | `public-p07-reset-password-dark-valid.png`<br>`public-p07-reset-password-dark-invalid.png` |
| P08 `/join/:token` | 2 / dark | `public-p08-join-invitation-dark-valid.png`<br>`public-p08-join-invitation-dark-invalid.png` |
| P09 `/learn` | 3 / dark, light | `learner-p09-dashboard-dark-normal.png`<br>`learner-p09-dashboard-light-normal.png`<br>`learner-p09-return-main-dark-with-sidebar.png` |
| P10 `/learn/courses` | 3 / dark, light | `learner-p10-mycourses-dark-in-progress.png`<br>`learner-p10-mycourses-light-in-progress.png`<br>`learner-p10-mycourses-dark-completed-tab-defect.png` |
| P11 `/learn/:enrollmentId` | 7 / dark, light | `learner-p10-mycourses-dark-in-progress.png`<br>`learner-p10-mycourses-light-in-progress.png`<br>`learner-p10-mycourses-dark-completed-tab-defect.png`<br>`learner-p11-course-overview-dark-normal.png`<br>`learner-p11-course-overview-dark-normal__full.png`<br>`learner-p11-course-overview-light-normal.png`<br>`learner-p11-course-overview-light-normal__full.png` |
| P12 `/learn/:enrollmentId/steps/:stepId` | 4 / dark, light | `learner-p12-theory-step-dark-normal.png`<br>`learner-p12-theory-step-light-normal.png`<br>`learner-p12-theory-sidebar-dark-reset-defect.png`<br>`learner-p12-sidebar-spa-nav-reset.png` |
| P13 `/learn/:enrollmentId/steps/:stepId` | 2 / dark, light | `learner-p13-video-step-dark-normal.png`<br>`learner-p13-video-step-light-normal.png` |
| P14 `/learn/:enrollmentId/steps/:stepId` | 4 / dark, light | `learner-p14-quiz-single-dark-normal.png`<br>`learner-p14-quiz-single-light-normal.png`<br>`learner-p14-quiz-multi-light-incorrect-selection.png`<br>`learner-p14-quiz-multi-light-correct-success-next.png` |
| P15 `/learn/:enrollmentId/steps/:stepId` | 11 / dark, light | `learner-p15-python-editor-dark-normal.png`<br>`learner-p15-python-editor-dark-narrow-1100.png`<br>`learner-p15-python-editor-light-normal.png`<br>`learner-p15-python-taskstrip-dark-12-tasks.png`<br>`learner-p15-python-sidebar-dark-collapsed.png`<br>`learner-p15-python-samples-dark-fail-diff.png`<br>`learner-p15-python-custom-dark-stdout.png`<br>`learner-p15-python-submit-dark-passed-green.png`<br>`learner-p15-python-infra-dark-retry-banner.png`<br>`learner-p15-python-report-modal-dark-opt-in.png`<br>`learner-p15-python-report-modal-tab-escape-focus.png` |
| P16 `/learn/:enrollmentId/steps/:stepId/attempts` | 0 / none | **Unverified** (no direct capture) |
| P16 `/learn/:enrollmentId/steps/:stepId/attempts/:attemptId` | 0 / none | **Unverified** (no direct capture) |
| P17 `/settings/profile` | 3 / dark, light | `learner-p17-settings-profile-dark-normal.png`<br>`learner-p17-settings-profile-light-normal.png`<br>`learner-p17-profile-dirty-back-discarded.png` |
| P18 `/settings/appearance` | 2 / dark, light | `learner-p18-settings-appearance-dark-normal.png`<br>`learner-p18-settings-appearance-light-normal.png` |
| P19 `/settings/security` | 2 / dark, light | `learner-p19-settings-security-dark-normal.png`<br>`learner-p19-settings-security-light-normal.png` |
| P20 `/settings/privacy` | 2 / dark, light | `learner-p20-settings-privacy-dark-normal.png`<br>`learner-p20-settings-privacy-light-normal.png` |
| P21 `/teach` | 2 / dark, light | `author-p21-dashboard-dark-normal.png`<br>`author-p21-dashboard-light-normal.png` |
| P22 `/teach/:courseId/content` | 2 / dark, light | `author-p22-builder-tree-dark-normal.png`<br>`author-p22-builder-tree-light-normal.png` |
| P23 `/teach/:courseId/content/theory/:stepId` | 3 / dark, light | `author-p23-editor-theory-dark-normal.png`<br>`author-p23-editor-theory-light-normal.png`<br>`author-p23-editor-theory-dark-dirty.png` |
| P23 `/teach/:courseId/content/video/:stepId` | 2 / dark, light | `author-p23-editor-video-dark-normal.png`<br>`author-p23-editor-video-light-normal.png` |
| P24 `/teach/:courseId/content/quiz/:stepId` | 2 / dark, light | `author-p24-editor-quiz-dark-normal.png`<br>`author-p24-editor-quiz-light-normal.png` |
| P25 `/teach/:courseId/content/python/:stepId` | 3 / dark, light | `author-p25-editor-python-dark-normal.png`<br>`author-p25-editor-python-light-normal.png`<br>`author-p25-editor-python-dark-tab-tests.png` |
| P26 `/teach/:courseId/preview` | 3 / dark, light | `author-p26-student-preview-dark-normal.png`<br>`author-p26-student-preview-light-normal.png`<br>`author-p26-student-preview-python-dark.png` |
| P27 `/teach/:courseId/publish` | 2 / dark, light | `author-p27-publish-review-dark-normal.png`<br>`author-p27-publish-review-light-normal.png` |
| P28 `/teach/:courseId/students` | 2 / dark, light | `author-p28-students-roster-dark-normal.png`<br>`author-p28-students-roster-light-normal.png` |
| P28 `/teach/:courseId/roster` | 0 / none | **Unverified** (no direct capture) |
| P29 `/teach/:courseId/students/:enrollmentId` | 2 / dark, light | `author-p29-student-detail-dark-normal.png`<br>`author-p29-student-detail-light-normal.png` |
| P30 `/teach/:courseId/analytics` | 2 / dark, light | `author-p30-course-analytics-dark-normal.png`<br>`author-p30-course-analytics-light-normal.png` |
| P31 `/teach/:courseId/settings` | 2 / dark, light | `author-p31-course-settings-dark-normal.png`<br>`author-p31-course-settings-light-normal.png` |
| P32 `/admin` | 4 / dark, light | `admin-p32-operations-overview-dark-normal.png`<br>`admin-p32-operations-overview-dark-normal__full.png`<br>`admin-p32-operations-overview-light-normal.png`<br>`admin-p32-operations-overview-light-normal__full.png` |
| P33 `/admin/users` | 2 / dark, light | `admin-p33-users-list-dark-normal.png`<br>`admin-p33-users-list-light-normal.png` |
| P33 `/admin/users/:userId` | 6 / dark, light | `admin-p33-user-detail-dark-normal.png`<br>`admin-p33-user-detail-light-normal.png`<br>`admin-p33-dialog-suspend-user-error-dark.png`<br>`admin-p33-user-suspended-receipt-dark.png`<br>`admin-p33-dialog-manage-roles-error-dark.png`<br>`admin-p33-dialog-support-access-error-dark.png` |
| P34 `/admin/courses` | 2 / dark, light | `admin-p34-courses-list-dark-normal.png`<br>`admin-p34-courses-list-light-normal.png` |
| P34 `/admin/courses/:courseId` | 4 / dark, light | `admin-p34-course-detail-dark-normal.png`<br>`admin-p34-course-detail-light-normal.png`<br>`admin-p34-dialog-course-availability-error-dark.png`<br>`admin-p34-dialog-course-waiver-preview-dark.png` |
| P35 `/admin/categories` | 3 / dark, light | `admin-p35-categories-dark-normal.png`<br>`admin-p35-categories-light-normal.png`<br>`admin-p35-category-edit-dialog-dark.png` |
| P36 `/admin/reports` | 2 / dark, light | `admin-p36-reports-list-dark-normal.png`<br>`admin-p36-reports-list-light-normal.png` |
| P36 `/admin/reports/:reportId` | 4 / dark, light | `admin-p36-report-detail-dark-normal.png`<br>`admin-p36-report-detail-dark-normal__full.png`<br>`admin-p36-report-detail-light-normal.png`<br>`admin-p36-report-detail-light-normal__full.png` |
| P37 `/admin/media` | 2 / dark, light | `admin-p37-media-dark-normal.png`<br>`admin-p37-media-light-normal.png` |
| P38 `/admin/execution` | 3 / dark, light | `admin-p38-execution-dark-normal.png`<br>`admin-p38-execution-light-normal.png`<br>`admin-p38-execution-dialog-dark.png` |
| P39 `/admin/audit` | 2 / dark, light | `admin-p39-audit-list-dark-normal.png`<br>`admin-p39-audit-list-light-normal.png` |
| P39 `/admin/audit/:eventId` | 2 / dark, light | `admin-p39-audit-detail-dark-normal.png`<br>`admin-p39-audit-detail-light-normal.png` |
| P40 `/help` | 4 / dark, light | `public-p40-help-dark-normal.png`<br>`public-p40-help-dark-normal__full.png`<br>`public-p40-help-light-normal.png`<br>`public-p40-help-light-normal__full.png` |
| P41 `/privacy` | 2 / dark, light | `public-p41-privacy-dark-normal.png`<br>`public-p41-privacy-light-normal.png` |
| P41 `/terms` | 2 / dark, light | `public-p41-terms-dark-normal.png`<br>`public-p41-terms-light-normal.png` |
| P42 `/access-denied` | 2 / dark, light | `public-p42-access-denied-dark-normal.png`<br>`public-p42-access-denied-light-normal.png` |
| P42 `/not-found` | 2 / dark, light | `public-p42-not-found-dark-normal.png`<br>`public-p42-not-found-light-normal.png` |
| P43 `/settings/ai-connections` | 2 / dark, light | `author-p43-ai-connections-dark-normal.png`<br>`author-p43-ai-connections-light-normal.png` |
| P44 `/settings/ai-connections/:connectionId/setup` | 4 / dark, light | `author-p44-connection-setup-dark-normal.png`<br>`author-p44-connection-setup-dark-normal__full.png`<br>`author-p44-connection-setup-light-normal.png`<br>`author-p44-connection-setup-light-normal__full.png` |
| P45 `/teach/:courseId/activity` | 2 / dark, light | `author-p45-agent-activity-dark-normal.png`<br>`author-p45-agent-activity-light-normal.png` |

## State details

| Role / route / theme | Observed presentation | Local screenshot |
|---|---|---|
| learner `/learn` / dark | learner home dashboard with continue card and recent courses | `screenshots/interface-review-2026-10-06/learner/learner-p09-dashboard-dark-normal.png` |
| learner `/learn` / light | learner home dashboard with continue card and recent courses | `screenshots/interface-review-2026-10-06/learner/learner-p09-dashboard-light-normal.png` |
| learner `/learn/courses` / dark | my courses list default in-progress filter | `screenshots/interface-review-2026-10-06/learner/learner-p10-mycourses-dark-in-progress.png` |
| learner `/learn/courses` / light | my courses list default in-progress filter | `screenshots/interface-review-2026-10-06/learner/learner-p10-mycourses-light-in-progress.png` |
| learner `/learn/courses?filter=completed` / dark | my courses with filter=completed demonstrating activeFilter omitted defect | `screenshots/interface-review-2026-10-06/learner/learner-p10-mycourses-dark-completed-tab-defect.png` |
| learner `/learn/enr-ada` / dark | course outline with modules, lessons, and progress | `screenshots/interface-review-2026-10-06/learner/learner-p11-course-overview-dark-normal.png` |
| learner `/learn/enr-ada` / dark | course outline with modules, lessons, and progress (full page) | `screenshots/interface-review-2026-10-06/learner/learner-p11-course-overview-dark-normal__full.png` |
| learner `/learn/enr-ada` / light | course outline with modules, lessons, and progress | `screenshots/interface-review-2026-10-06/learner/learner-p11-course-overview-light-normal.png` |
| learner `/learn/enr-ada` / light | course outline with modules, lessons, and progress (full page) | `screenshots/interface-review-2026-10-06/learner/learner-p11-course-overview-light-normal__full.png` |
| learner `/learn/enr-ada/steps/step-1-theory` / dark | theory lesson step with prose and code example | `screenshots/interface-review-2026-10-06/learner/learner-p12-theory-step-dark-normal.png` |
| learner `/learn/enr-ada/steps/step-1-theory` / light | theory lesson step with prose and code example | `screenshots/interface-review-2026-10-06/learner/learner-p12-theory-step-light-normal.png` |
| learner `/learn/enr-ada/steps/step-2-video` / dark | video lesson step with player embed container and transcript | `screenshots/interface-review-2026-10-06/learner/learner-p13-video-step-dark-normal.png` |
| learner `/learn/enr-ada/steps/step-2-video` / light | video lesson step with player embed container and transcript | `screenshots/interface-review-2026-10-06/learner/learner-p13-video-step-light-normal.png` |
| learner `/learn/enr-ada/steps/step-3-quiz-single` / dark | single-choice quiz step unselected state | `screenshots/interface-review-2026-10-06/learner/learner-p14-quiz-single-dark-normal.png` |
| learner `/learn/enr-ada/steps/step-3-quiz-single` / light | single-choice quiz step unselected state | `screenshots/interface-review-2026-10-06/learner/learner-p14-quiz-single-light-normal.png` |
| learner `/learn/enr-ada/steps/step-5-quiz-multi` / light | incorrect selection feedback banner and single assessment action | `screenshots/interface-review-2026-10-06/learner/learner-p14-quiz-multi-light-incorrect-selection.png` |
| learner `/learn/enr-ada/steps/step-5-quiz-multi` / light | correct answer feedback banner, inline Next link, and green task square | `screenshots/interface-review-2026-10-06/learner/learner-p14-quiz-multi-light-correct-success-next.png` |
| learner `/learn/enr-ada/steps/step-4-python-echo` / dark | python coding split view with instructions left and editor right | `screenshots/interface-review-2026-10-06/learner/learner-p15-python-editor-dark-normal.png` |
| learner `/learn/enr-ada/steps/step-4-python-echo` / dark | python coding split view at 1100x900 narrow desktop width | `screenshots/interface-review-2026-10-06/learner/learner-p15-python-editor-dark-narrow-1100.png` |
| learner `/learn/enr-ada/steps/step-4-python-echo` / light | python coding split view light theme comparison | `screenshots/interface-review-2026-10-06/learner/learner-p15-python-editor-light-normal.png` |
| learner `/learn/enr-ada/steps/step-4-python-echo` / dark | 12-task strip showing completed, waived, selected, and upcoming task squares | `screenshots/interface-review-2026-10-06/learner/learner-p15-python-taskstrip-dark-12-tasks.png` |
| learner `/learn/enr-ada/steps/step-4-python-echo` / dark | sidebar collapsed; persistent toggle button on top-left remains in position | `screenshots/interface-review-2026-10-06/learner/learner-p15-python-sidebar-dark-collapsed.png` |
| learner `/learn/enr-ada/steps/step-1-theory` / dark | theory step demonstrating sidebar collapsed state unexpectedly reset to expanded after navigation | `screenshots/interface-review-2026-10-06/learner/learner-p12-theory-sidebar-dark-reset-defect.png` |
| learner `/learn/enr-ada/steps/step-4-python-echo` / dark | python run samples failure result banner with test diff comparison | `screenshots/interface-review-2026-10-06/learner/learner-p15-python-samples-dark-fail-diff.png` |
| learner `/learn/enr-ada/steps/step-4-python-echo` / dark | run code execution output showing plain stdout without test comparison clutter | `screenshots/interface-review-2026-10-06/learner/learner-p15-python-custom-dark-stdout.png` |
| learner `/learn/enr-ada/steps/step-4-python-echo` / dark | graded submission passed; active task square turns green; sidebar shows 6 of 15 completed and Continue button appears | `screenshots/interface-review-2026-10-06/learner/learner-p15-python-submit-dark-passed-green.png` |
| learner `/learn/enr-ada/steps/step-4-python-echo` / dark | controlled infrastructure error banner with actionable Retry Execution button and draft code intact | `screenshots/interface-review-2026-10-06/learner/learner-p15-python-infra-dark-retry-banner.png` |
| learner `/learn/enr-ada/steps/step-4-python-echo` / dark | in-workspace exercise report dialog with prefilled context and opt-in unchecked code consent | `screenshots/interface-review-2026-10-06/learner/learner-p15-python-report-modal-dark-opt-in.png` |
| learner `http://127.0.0.1:35877/learn/enr-ada/steps/step-4-python-echo/attempts` / dark | submission history list showing literal placeholder History sidebar defect and missing task strip | `screenshots/interface-review-2026-10-06/learner/learner-p16-attempts-history-dark-placeholder-sidebar.png` |
| learner `http://127.0.0.1:35877/learn/enr-ada/steps/step-4-python-echo/attempts` / light | submission history list light theme | `screenshots/interface-review-2026-10-06/learner/learner-p16-attempts-history-light-normal.png` |
| learner `http://127.0.0.1:35877/learn/enr-ada/steps/step-4-python-echo/attempts/att-ada-1` / dark | attempt detail view with submitted code snapshot, status badge, runtime metadata, and return button | `screenshots/interface-review-2026-10-06/learner/learner-p16-attempt-detail-dark-normal.png` |
| learner `http://127.0.0.1:35877/learn/enr-ada/steps/step-4-python-echo/attempts/att-ada-1` / light | attempt detail view light theme comparison | `screenshots/interface-review-2026-10-06/learner/learner-p16-attempt-detail-light-normal.png` |
| learner `/learn` / dark | verified return link from workspace cleanly restores main learner dashboard and sidebar navigation | `screenshots/interface-review-2026-10-06/learner/learner-p09-return-main-dark-with-sidebar.png` |
| learner `/courses` / dark | verified authenticated Explore catalog retains app-sidebar and active navigation item | `screenshots/interface-review-2026-10-06/learner/learner-p02-explore-auth-dark-with-sidebar.png` |
| learner `/courses?q=Python` / dark | authenticated Explore catalog with active search query and matching course cards | `screenshots/interface-review-2026-10-06/learner/learner-p02-explore-auth-dark-filtered.png` |
| learner `/courses/course-python-foundations` / dark | course overview page accessed by enrolled learner with continue button and curriculum syllabus | `screenshots/interface-review-2026-10-06/learner/learner-p03-course-overview-auth-dark-normal.png` |
| learner `/courses/course-python-foundations` / dark | course overview page accessed by enrolled learner with continue button and curriculum syllabus (full page) | `screenshots/interface-review-2026-10-06/learner/learner-p03-course-overview-auth-dark-normal__full.png` |
| learner `/settings/profile` / dark | profile settings form with display name and email fields | `screenshots/interface-review-2026-10-06/learner/learner-p17-settings-profile-dark-normal.png` |
| learner `/settings/profile` / light | profile settings form light theme | `screenshots/interface-review-2026-10-06/learner/learner-p17-settings-profile-light-normal.png` |
| learner `/settings/appearance` / dark | appearance settings theme selection radio cards | `screenshots/interface-review-2026-10-06/learner/learner-p18-settings-appearance-dark-normal.png` |
| learner `/settings/appearance` / light | appearance settings light theme | `screenshots/interface-review-2026-10-06/learner/learner-p18-settings-appearance-light-normal.png` |
| learner `/settings/security` / dark | security settings password change and active sessions table | `screenshots/interface-review-2026-10-06/learner/learner-p19-settings-security-dark-normal.png` |
| learner `/settings/security` / light | security settings light theme | `screenshots/interface-review-2026-10-06/learner/learner-p19-settings-security-light-normal.png` |
| learner `/settings/privacy` / dark | privacy settings data export and account deletion cards | `screenshots/interface-review-2026-10-06/learner/learner-p20-settings-privacy-dark-normal.png` |
| learner `/settings/privacy` / light | privacy settings light theme | `screenshots/interface-review-2026-10-06/learner/learner-p20-settings-privacy-light-normal.png` |
| learner `/learn/enr-ada/steps/step-4-python-echo` / dark | report issue modal demonstrating focus escape to background via native CDP Tab key events | `screenshots/interface-review-2026-10-06/learner/learner-p15-python-report-modal-tab-escape-focus.png` |
| learner `/settings/profile` / dark | profile settings demonstrating draft loss after native browser Back navigation | `screenshots/interface-review-2026-10-06/learner/learner-p17-profile-dirty-back-discarded.png` |
| learner `/learn/enr-ada/steps/step-5-waived-theory` / dark | Collapsed curriculum remains collapsed after real SPA task navigation; filename retained from executor, reset was not observed | `screenshots/interface-review-2026-10-06/learner/learner-p12-sidebar-spa-nav-reset.png` |
| learner `/courses` / dark | authenticated Explore catalog loading skeleton with persistent app sidebar | `screenshots/interface-review-2026-10-06/learner/learner-p02-explore-auth-dark-loading.png` |
| learner `/courses` / light | authenticated Explore catalog loading skeleton in light theme with persistent app sidebar | `screenshots/interface-review-2026-10-06/learner/learner-p02-explore-auth-light-loading.png` |
| learner `/courses` / dark | authenticated Explore catalog service error state with persistent navigation and retry action | `screenshots/interface-review-2026-10-06/learner/learner-p02-explore-auth-dark-error.png` |
| learner `/courses` / light | authenticated Explore catalog service error state in light theme with persistent navigation | `screenshots/interface-review-2026-10-06/learner/learner-p02-explore-auth-light-error.png` |
| learner `/courses?q=nomatchqueryxyz12345` / dark | authenticated Explore catalog empty search state with clear filters guidance | `screenshots/interface-review-2026-10-06/learner/learner-p02-explore-auth-dark-no-matches.png` |
| learner `/courses?q=nomatchqueryxyz12345` / light | authenticated Explore catalog empty search state in light theme | `screenshots/interface-review-2026-10-06/learner/learner-p02-explore-auth-light-no-matches.png` |
| learner `/courses/nonexistent-course-id-999` / dark | authenticated course overview 404 error state preserving return navigation to catalog | `screenshots/interface-review-2026-10-06/learner/learner-p03-course-overview-auth-dark-error.png` |
| learner `/courses/nonexistent-course-id-999` / light | authenticated course overview 404 error state in light theme | `screenshots/interface-review-2026-10-06/learner/learner-p03-course-overview-auth-light-error.png` |
| author `/teach` / dark | author dashboard listing owned courses with draft/published status and action buttons | `screenshots/interface-review-2026-10-06/author/author-p21-dashboard-dark-normal.png` |
| author `/teach` / light | author dashboard light theme | `screenshots/interface-review-2026-10-06/author/author-p21-dashboard-light-normal.png` |
| author `/teach/course-python-foundations/content` / dark | course builder curriculum tree showing modules, lessons, steps, and inspector pane | `screenshots/interface-review-2026-10-06/author/author-p22-builder-tree-dark-normal.png` |
| author `/teach/course-python-foundations/content` / light | course builder curriculum tree light theme | `screenshots/interface-review-2026-10-06/author/author-p22-builder-tree-light-normal.png` |
| author `/teach/course-python-foundations/content/theory/step-1-theory` / dark | theory lesson editor with markdown textarea, preview toggle, and save button | `screenshots/interface-review-2026-10-06/author/author-p23-editor-theory-dark-normal.png` |
| author `/teach/course-python-foundations/content/theory/step-1-theory` / light | theory lesson editor light theme | `screenshots/interface-review-2026-10-06/author/author-p23-editor-theory-light-normal.png` |
| author `/teach/course-python-foundations/content/theory/step-1-theory` / dark | theory editor dirty state showing unsaved indicator and active save CTA | `screenshots/interface-review-2026-10-06/author/author-p23-editor-theory-dark-dirty.png` |
| author `/teach/course-python-foundations/content/video/step-2-video` / dark | video lesson editor with embed URL input, provider select, and transcript textarea | `screenshots/interface-review-2026-10-06/author/author-p23-editor-video-dark-normal.png` |
| author `/teach/course-python-foundations/content/video/step-2-video` / light | video lesson editor light theme | `screenshots/interface-review-2026-10-06/author/author-p23-editor-video-light-normal.png` |
| author `/teach/course-python-foundations/content/quiz/step-3-quiz-single` / dark | quiz editor with prompt textarea, option rows, correct answer checkboxes, and explanation | `screenshots/interface-review-2026-10-06/author/author-p24-editor-quiz-dark-normal.png` |
| author `/teach/course-python-foundations/content/quiz/step-3-quiz-single` / light | quiz editor light theme | `screenshots/interface-review-2026-10-06/author/author-p24-editor-quiz-light-normal.png` |
| author `/teach/course-python-foundations/content/python/step-4-python-echo` / dark | python exercise editor problem statement tab with markdown inputs and hints | `screenshots/interface-review-2026-10-06/author/author-p25-editor-python-dark-normal.png` |
| author `/teach/course-python-foundations/content/python/step-4-python-echo` / light | python exercise editor light theme | `screenshots/interface-review-2026-10-06/author/author-p25-editor-python-light-normal.png` |
| author `/teach/course-python-foundations/content/python/step-4-python-echo?tab=tests` / dark | python exercise editor deep linked to test cases tab with public and hidden test cases | `screenshots/interface-review-2026-10-06/author/author-p25-editor-python-dark-tab-tests.png` |
| author `/teach/course-python-foundations/preview` / dark | author student preview showing course banner, curriculum outline, and non-destructive practice mode | `screenshots/interface-review-2026-10-06/author/author-p26-student-preview-dark-normal.png` |
| author `/teach/course-python-foundations/preview` / light | student preview light theme | `screenshots/interface-review-2026-10-06/author/author-p26-student-preview-light-normal.png` |
| author `/teach/course-python-foundations/preview?stepId=step-4-python-echo` / dark | student preview of Python exercise in paired workspace layout with preview notification strip | `screenshots/interface-review-2026-10-06/author/author-p26-student-preview-python-dark.png` |
| author `/teach/course-python-foundations/publish` / dark | review publication checklist showing validation requirements, warnings, and publish release button | `screenshots/interface-review-2026-10-06/author/author-p27-publish-review-dark-normal.png` |
| author `/teach/course-python-foundations/publish` / light | review publication checklist light theme | `screenshots/interface-review-2026-10-06/author/author-p27-publish-review-light-normal.png` |
| author `/teach/course-python-foundations/students` / dark | students roster table showing enrolled learners, progress percentages, and invite tokens | `screenshots/interface-review-2026-10-06/author/author-p28-students-roster-dark-normal.png` |
| author `/teach/course-python-foundations/students` / light | students roster table light theme | `screenshots/interface-review-2026-10-06/author/author-p28-students-roster-light-normal.png` |
| author `/teach/course-python-foundations/students/enr-ada` / dark | student detail view showing Ada Lovelace step completion history and waiver status | `screenshots/interface-review-2026-10-06/author/author-p29-student-detail-dark-normal.png` |
| author `/teach/course-python-foundations/students/enr-ada` / light | student detail view light theme | `screenshots/interface-review-2026-10-06/author/author-p29-student-detail-light-normal.png` |
| author `/teach/course-python-foundations/analytics` / dark | course analytics dashboard showing enrollment trends, completion rates, and exercise drop-off metrics | `screenshots/interface-review-2026-10-06/author/author-p30-course-analytics-dark-normal.png` |
| author `/teach/course-python-foundations/analytics` / light | course analytics dashboard light theme | `screenshots/interface-review-2026-10-06/author/author-p30-course-analytics-light-normal.png` |
| author `/teach/course-python-foundations/settings` / dark | course settings form with title, slug, difficulty, category, and archive actions | `screenshots/interface-review-2026-10-06/author/author-p31-course-settings-dark-normal.png` |
| author `/teach/course-python-foundations/settings` / light | course settings form light theme | `screenshots/interface-review-2026-10-06/author/author-p31-course-settings-light-normal.png` |
| author `/settings/ai-connections` / dark | author AI connections page listing MCP agent access tokens and scopes | `screenshots/interface-review-2026-10-06/author/author-p43-ai-connections-dark-normal.png` |
| author `/settings/ai-connections` / light | AI connections page light theme | `screenshots/interface-review-2026-10-06/author/author-p43-ai-connections-light-normal.png` |
| author `/settings/ai-connections/tok-guido-1/setup` / dark | MCP connection setup guide showing Claude Desktop / Cursor JSON configuration snippets | `screenshots/interface-review-2026-10-06/author/author-p44-connection-setup-dark-normal.png` |
| author `/settings/ai-connections/tok-guido-1/setup` / dark | MCP connection setup guide showing Claude Desktop / Cursor JSON configuration snippets (full page) | `screenshots/interface-review-2026-10-06/author/author-p44-connection-setup-dark-normal__full.png` |
| author `/settings/ai-connections/tok-guido-1/setup` / light | connection setup guide light theme | `screenshots/interface-review-2026-10-06/author/author-p44-connection-setup-light-normal.png` |
| author `/settings/ai-connections/tok-guido-1/setup` / light | connection setup guide light theme (full page) | `screenshots/interface-review-2026-10-06/author/author-p44-connection-setup-light-normal__full.png` |
| author `/teach/course-python-foundations/activity` / dark | agent activity timeline showing tool mutations, base/new revisions, and draft diff recovery | `screenshots/interface-review-2026-10-06/author/author-p45-agent-activity-dark-normal.png` |
| author `/teach/course-python-foundations/activity` / light | agent activity timeline light theme | `screenshots/interface-review-2026-10-06/author/author-p45-agent-activity-light-normal.png` |
| admin `/admin` / dark | admin operations overview dashboard with platform health metrics, alerts, and quick actions | `screenshots/interface-review-2026-10-06/admin/admin-p32-operations-overview-dark-normal.png` |
| admin `/admin` / dark | admin operations overview dashboard with platform health metrics, alerts, and quick actions (full page) | `screenshots/interface-review-2026-10-06/admin/admin-p32-operations-overview-dark-normal__full.png` |
| admin `/admin` / light | admin operations overview dashboard light theme | `screenshots/interface-review-2026-10-06/admin/admin-p32-operations-overview-light-normal.png` |
| admin `/admin` / light | admin operations overview dashboard light theme (full page) | `screenshots/interface-review-2026-10-06/admin/admin-p32-operations-overview-light-normal__full.png` |
| admin `/admin/users` / dark | admin users list table showing user accounts, roles, capabilities, and status badges | `screenshots/interface-review-2026-10-06/admin/admin-p33-users-list-dark-normal.png` |
| admin `/admin/users` / light | admin users list table light theme | `screenshots/interface-review-2026-10-06/admin/admin-p33-users-list-light-normal.png` |
| admin `/admin/users/user-student-1` / dark | admin user detail view for Ada Lovelace showing account metadata, active enrollments, and moderation actions | `screenshots/interface-review-2026-10-06/admin/admin-p33-user-detail-dark-normal.png` |
| admin `/admin/users/user-student-1` / light | admin user detail view light theme | `screenshots/interface-review-2026-10-06/admin/admin-p33-user-detail-light-normal.png` |
| admin `/admin/courses` / dark | admin course operations table showing course catalog, versions, publication status, and author details | `screenshots/interface-review-2026-10-06/admin/admin-p34-courses-list-dark-normal.png` |
| admin `/admin/courses` / light | admin course operations table light theme | `screenshots/interface-review-2026-10-06/admin/admin-p34-courses-list-light-normal.png` |
| admin `/admin/courses/course-python-foundations` / dark | admin course operational detail view showing syllabus metadata, version history, and moderation controls | `screenshots/interface-review-2026-10-06/admin/admin-p34-course-detail-dark-normal.png` |
| admin `/admin/courses/course-python-foundations` / light | admin course operational detail view light theme | `screenshots/interface-review-2026-10-06/admin/admin-p34-course-detail-light-normal.png` |
| admin `/admin/categories` / dark | admin course category taxonomy management table with slugs, names, and course associations | `screenshots/interface-review-2026-10-06/admin/admin-p35-categories-dark-normal.png` |
| admin `/admin/categories` / light | admin course category taxonomy table light theme | `screenshots/interface-review-2026-10-06/admin/admin-p35-categories-light-normal.png` |
| admin `/admin/categories` / dark | Category dialog containing rename and removal forms, reasons/passwords and free-text replacement category ID | `screenshots/interface-review-2026-10-06/admin/admin-p35-category-edit-dialog-dark.png` |
| admin `/admin/reports` / dark | admin user reports and flags queue showing open issues, reporters, and exercise context | `screenshots/interface-review-2026-10-06/admin/admin-p36-reports-list-dark-normal.png` |
| admin `/admin/reports` / light | admin user reports and flags queue light theme | `screenshots/interface-review-2026-10-06/admin/admin-p36-reports-list-light-normal.png` |
| admin `/admin/reports/rep-polish-1` / dark | admin report detail view showing submitted code snippet, reporter description, and resolution actions | `screenshots/interface-review-2026-10-06/admin/admin-p36-report-detail-dark-normal.png` |
| admin `/admin/reports/rep-polish-1` / dark | admin report detail view showing submitted code snippet, reporter description, and resolution actions (full page) | `screenshots/interface-review-2026-10-06/admin/admin-p36-report-detail-dark-normal__full.png` |
| admin `/admin/reports/rep-polish-1` / light | admin report detail view light theme | `screenshots/interface-review-2026-10-06/admin/admin-p36-report-detail-light-normal.png` |
| admin `/admin/reports/rep-polish-1` / light | admin report detail view light theme (full page) | `screenshots/interface-review-2026-10-06/admin/admin-p36-report-detail-light-normal__full.png` |
| admin `/admin/media` / dark | admin media asset repository table showing uploaded images, MIME types, dimensions, and course attachments | `screenshots/interface-review-2026-10-06/admin/admin-p37-media-dark-normal.png` |
| admin `/admin/media` / light | admin media asset repository table light theme | `screenshots/interface-review-2026-10-06/admin/admin-p37-media-light-normal.png` |
| admin `/admin/execution` / dark | admin code execution subsystem status showing worker pool health, active jobs, and pause execution control | `screenshots/interface-review-2026-10-06/admin/admin-p38-execution-dark-normal.png` |
| admin `/admin/execution` / light | admin code execution status light theme | `screenshots/interface-review-2026-10-06/admin/admin-p38-execution-light-normal.png` |
| admin `/admin/execution` / dark | pause execution confirmation modal dialog with warning details | `screenshots/interface-review-2026-10-06/admin/admin-p38-execution-dialog-dark.png` |
| admin `/admin/audit` / dark | admin audit trail log table showing administrative actions, actor IDs, correlation IDs, and timestamps | `screenshots/interface-review-2026-10-06/admin/admin-p39-audit-list-dark-normal.png` |
| admin `/admin/audit` / light | admin audit trail log table light theme | `screenshots/interface-review-2026-10-06/admin/admin-p39-audit-list-light-normal.png` |
| admin `/admin/audit/audit-polish-1` / dark | admin audit event detail view showing actor details, target entity, justification reason, and correlation payload | `screenshots/interface-review-2026-10-06/admin/admin-p39-audit-detail-dark-normal.png` |
| admin `/admin/audit/audit-polish-1` / light | admin audit event detail view light theme | `screenshots/interface-review-2026-10-06/admin/admin-p39-audit-detail-light-normal.png` |
| admin `/admin/users/user-student-1` / dark | suspend user dialog showing reauthentication error while preserving entered justification reason | `screenshots/interface-review-2026-10-06/admin/admin-p33-dialog-suspend-user-error-dark.png` |
| admin `/admin/users/user-student-1` / dark | user detail view after account suspension showing Suspended badge and Restore action | `screenshots/interface-review-2026-10-06/admin/admin-p33-user-suspended-receipt-dark.png` |
| admin `/admin/users/user-student-1` / dark | manage roles dialog showing invalid password error and preserved reason | `screenshots/interface-review-2026-10-06/admin/admin-p33-dialog-manage-roles-error-dark.png` |
| admin `/admin/users/user-student-1` / dark | audited support access dialog showing error and 30-minute session warning | `screenshots/interface-review-2026-10-06/admin/admin-p33-dialog-support-access-error-dark.png` |
| admin `/admin/courses/course-python-foundations` / dark | course availability toggle dialog showing password error and state transition warning | `screenshots/interface-review-2026-10-06/admin/admin-p34-dialog-course-availability-error-dark.png` |
| admin `/admin/courses/course-python-foundations` / dark | course progression waiver dialog showing live affected enrollments calculation and immutable scope notice | `screenshots/interface-review-2026-10-06/admin/admin-p34-dialog-course-waiver-preview-dark.png` |
| public `/` / dark | Landing during typewriter entrance animation; partial headline, not a settled headline frame | `screenshots/interface-review-2026-10-06/public/public-p01-landing-dark-normal.png` |
| public `/` / dark | Landing during typewriter entrance animation; partial headline, not a settled headline frame (full page) | `screenshots/interface-review-2026-10-06/public/public-p01-landing-dark-normal__full.png` |
| public `/` / light | public landing page light theme | `screenshots/interface-review-2026-10-06/public/public-p01-landing-light-normal.png` |
| public `/` / light | public landing page light theme (full page) | `screenshots/interface-review-2026-10-06/public/public-p01-landing-light-normal__full.png` |
| public `/courses` / dark | public course catalog with search input, level filters, and course cards | `screenshots/interface-review-2026-10-06/public/public-p02-catalog-dark-normal.png` |
| public `/courses` / light | public course catalog light theme | `screenshots/interface-review-2026-10-06/public/public-p02-catalog-light-normal.png` |
| public `/courses?q=python&level=beginner` / dark | public catalog with active search query and beginner level filter | `screenshots/interface-review-2026-10-06/public/public-p02-catalog-dark-filtered.png` |
| public `/courses?q=nonexistentcourse12345` / dark | public catalog zero search results empty state | `screenshots/interface-review-2026-10-06/public/public-p02-catalog-dark-empty.png` |
| public `/courses/course-python-foundations` / dark | public course overview showing syllabus, modules, and enrollment CTA | `screenshots/interface-review-2026-10-06/public/public-p03-course-overview-dark-normal.png` |
| public `/courses/course-python-foundations` / dark | public course overview showing syllabus, modules, and enrollment CTA (full page) | `screenshots/interface-review-2026-10-06/public/public-p03-course-overview-dark-normal__full.png` |
| public `/courses/course-python-foundations` / light | public course overview light theme | `screenshots/interface-review-2026-10-06/public/public-p03-course-overview-light-normal.png` |
| public `/courses/course-python-foundations` / light | public course overview light theme (full page) | `screenshots/interface-review-2026-10-06/public/public-p03-course-overview-light-normal__full.png` |
| public `/sign-in` / dark | public sign-in form with email and password inputs and forgot password link | `screenshots/interface-review-2026-10-06/public/public-p04-sign-in-dark-normal.png` |
| public `/sign-in` / light | public sign-in form light theme | `screenshots/interface-review-2026-10-06/public/public-p04-sign-in-light-normal.png` |
| public `/sign-in` / dark | sign-in form client validation error on empty fields | `screenshots/interface-review-2026-10-06/public/public-p04-sign-in-dark-error.png` |
| public `/sign-up` / dark | public registration form with name, email, and password fields | `screenshots/interface-review-2026-10-06/public/public-p05-sign-up-dark-normal.png` |
| public `/sign-up` / light | public registration form light theme | `screenshots/interface-review-2026-10-06/public/public-p05-sign-up-light-normal.png` |
| public `/sign-up` / dark | Registration adult-eligibility consent required error; other validation not established | `screenshots/interface-review-2026-10-06/public/public-p05-sign-up-dark-error.png` |
| public `/verify-email` / dark | verify email instruction page visited directly without pending token | `screenshots/interface-review-2026-10-06/public/public-p06-verify-email-dark-direct.png` |
| public `/verify-email?email=ada@zur.internal` / dark | verify email confirmation notice displaying recipient email | `screenshots/interface-review-2026-10-06/public/public-p06-verify-email-dark-context.png` |
| public `/verify-email?email=ada@zur.internal` / light | verify email confirmation notice light theme | `screenshots/interface-review-2026-10-06/public/public-p06-verify-email-light-context.png` |
| public `/forgot-password` / dark | forgot password request form with email input and submit CTA | `screenshots/interface-review-2026-10-06/public/public-p07-forgot-password-dark-normal.png` |
| public `/forgot-password` / light | forgot password request form light theme | `screenshots/interface-review-2026-10-06/public/public-p07-forgot-password-light-normal.png` |
| public `/forgot-password` / dark | forgot password check email confirmation notice | `screenshots/interface-review-2026-10-06/public/public-p07-forgot-password-dark-submitted.png` |
| public `/reset-password?token=valid-reset-token-123` / dark | Initial password reset form with fixture token query; token validity/rejection not established by unsubmitted form | `screenshots/interface-review-2026-10-06/public/public-p07-reset-password-dark-valid.png` |
| public `/reset-password?token=expired-invalid-token` / dark | Initial password reset form with fixture token query; token validity/rejection not established by unsubmitted form | `screenshots/interface-review-2026-10-06/public/public-p07-reset-password-dark-invalid.png` |
| public `/join/valid-invite-token-123` / dark | course invitation landing page with course summary, inviter details, and accept CTA | `screenshots/interface-review-2026-10-06/public/public-p08-join-invitation-dark-valid.png` |
| public `/join/invalid-or-revoked-token` / dark | Invitation unavailable notice with Go to dashboard action; destination journey unverified | `screenshots/interface-review-2026-10-06/public/public-p08-join-invitation-dark-invalid.png` |
| public `/help` / dark | platform help and documentation page with FAQs and contact guides | `screenshots/interface-review-2026-10-06/public/public-p40-help-dark-normal.png` |
| public `/help` / dark | platform help and documentation page with FAQs and contact guides (full page) | `screenshots/interface-review-2026-10-06/public/public-p40-help-dark-normal__full.png` |
| public `/help` / light | platform help page light theme | `screenshots/interface-review-2026-10-06/public/public-p40-help-light-normal.png` |
| public `/help` / light | platform help page light theme (full page) | `screenshots/interface-review-2026-10-06/public/public-p40-help-light-normal__full.png` |
| public `/privacy` / dark | Privacy policy unavailable/pending publication notice; substantive policy not displayed | `screenshots/interface-review-2026-10-06/public/public-p41-privacy-dark-normal.png` |
| public `/privacy` / light | Privacy policy unavailable/pending publication notice; substantive policy not displayed | `screenshots/interface-review-2026-10-06/public/public-p41-privacy-light-normal.png` |
| public `/terms` / dark | Terms unavailable/pending publication notice; substantive terms not displayed | `screenshots/interface-review-2026-10-06/public/public-p41-terms-dark-normal.png` |
| public `/terms` / light | Terms unavailable/pending publication notice; substantive terms not displayed | `screenshots/interface-review-2026-10-06/public/public-p41-terms-light-normal.png` |
| public `/access-denied` / dark | access denied 403 error page with safe explanation and home CTA | `screenshots/interface-review-2026-10-06/public/public-p42-access-denied-dark-normal.png` |
| public `/access-denied` / light | access denied error page light theme | `screenshots/interface-review-2026-10-06/public/public-p42-access-denied-light-normal.png` |
| public `/not-found` / dark | not found 404 error page with safe explanation and home CTA | `screenshots/interface-review-2026-10-06/public/public-p42-not-found-dark-normal.png` |
| public `/not-found` / light | not found 404 error page light theme | `screenshots/interface-review-2026-10-06/public/public-p42-not-found-light-normal.png` |

## Findings and limits

See [learner coverage](learner-coverage.md), [author coverage](author-coverage.md), [admin coverage](admin-coverage.md), [public/account coverage](public-coverage.md) and [checked interactions](checked-interaction-log.json) for reviewed, retained, requiring-change and unverified behavior. No terminal summaries or browser error pages count as product evidence. Every role was reviewed and its plan saved before the next role screenshots were inspected. Shared review followed all four groups.
