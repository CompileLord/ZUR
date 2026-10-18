> UNVERIFIED AGY NOTES: See INDEX.md for Codex verification and corrections. Completion, layout, route coverage, and successful-run claims in this file must not be treated as verified.

# Complete ZUR Route Inventory (P01–P45) & Access Coverage

This inventory documents all routes defined in `packages/web/src/router/routes.ts`, their shell type, required capabilities, and capture status in the 2026-10-06 desktop review.

| Page ID | Route Path | Shell | Required Role | Page Title | Captured State | Screenshot Link |
|---|---|---|---|---|---|---|
| **P01** | `/` | S1 | Public | Understand it. Then write it. | Landing hero & pitch | [`public-shared/01-landing.png`](./public-shared/01-landing.png) |
| **P02** | `/courses` | S1 | Public | Explore courses | Catalog with course cards | [`public-shared/02-catalog.png`](./public-shared/02-catalog.png) |
| **P03** | `/courses/:courseId` | S1 | Public | Course Overview | Public syllabus & enroll prompt | [`public-shared/03-course-overview-public.png`](./public-shared/03-course-overview-public.png) |
| **P04** | `/sign-in` | S2 | Public | Welcome back | Login form with email/password | [`public-shared/04-sign-in.png`](./public-shared/04-sign-in.png) |
| **P05** | `/sign-up` | S2 | Public | Create your account | Registration form with consent | [`public-shared/05-sign-up.png`](./public-shared/05-sign-up.png) |
| **P06** | `/verify-email` | S2 | Public | Check your email | Token verification status | [`public-shared/07-verify-email.png`](./public-shared/07-verify-email.png) |
| **P07** | `/forgot-password` | S2 | Public | Reset password | Password recovery request form | [`public-shared/06-forgot-password.png`](./public-shared/06-forgot-password.png) |
| **P07** | `/reset-password` | S2 | Public | Update password | Password update form (with token) | Route accessible (requires token parameter) |
| **P08** | `/join/:token` | S2 | Public | Join course | Invitation claim screen | Route accessible (requires active invite token) |
| **P09** | `/learn` | S3 | Student | Continue learning | Student dashboard | [`learner/01-learner-dashboard.png`](./learner/01-learner-dashboard.png) |
| **P10** | `/learn/courses` | S3 | Student | My courses | Enrolled courses list | [`learner/02-my-courses.png`](./learner/02-my-courses.png) |
| **P11** | `/learn/:enrollmentId` | S3 | Student | Course Overview | Student course outline & progress | [`learner/03-course-outline.png`](./learner/03-course-outline.png) |
| **P12** | `/learn/:enrollmentId/steps/:stepId` (Theory) | S4 | Student | Learning Step | Theory reader view | [`learner/04-step-theory.png`](./learner/04-step-theory.png) |
| **P13** | `/learn/:enrollmentId/steps/:stepId` (Video) | S4 | Student | Video Step | Video player & transcript | [`learner/05-step-video.png`](./learner/05-step-video.png) |
| **P14** | `/learn/:enrollmentId/steps/:stepId` (Quiz) | S4 | Student | Quiz Step | Multiple-choice quiz options | [`learner/06-step-quiz.png`](./learner/06-step-quiz.png) |
| **P15** | `/learn/:enrollmentId/steps/:stepId` (Python) | S4 | Student | Python Workspace | Split view, editor, & run feedback | [`learner/07-python-workspace-editor.png`](./learner/07-python-workspace-editor.png)<br>[`learner/08-python-workspace-custom-input.png`](./learner/08-python-workspace-custom-input.png)<br>[`learner/09-python-workspace-run-feedback.png`](./learner/09-python-workspace-run-feedback.png)<br>[`learner/10-python-workspace-report-modal.png`](./learner/10-python-workspace-report-modal.png) |
| **P16** | `/learn/:enrollmentId/steps/:stepId/attempts` | S4 | Student | Submission History | Attempt history list | [`learner/11-submission-history.png`](./learner/11-submission-history.png) |
| **P17** | `/settings/profile` | S3 | Student | Profile settings | Display name & email settings | [`learner/12-settings-profile.png`](./learner/12-settings-profile.png) |
| **P18** | `/settings/appearance` | S3 | Student | Appearance settings | Theme selector (dark/light) | [`learner/13-settings-appearance.png`](./learner/13-settings-appearance.png) |
| **P19** | `/settings/security` | S3 | Student | Security settings | Password update & session revoke | [`learner/14-settings-security.png`](./learner/14-settings-security.png) |
| **P20** | `/settings/privacy` | S3 | Student | Privacy and account requests | Data export & deletion controls | [`learner/15-settings-privacy.png`](./learner/15-settings-privacy.png) |
| **P21** | `/teach` | S3 | Author | Your courses | Author course list dashboard | [`author/01-author-dashboard.png`](./author/01-author-dashboard.png) |
| **P22** | `/teach/:courseId/content` | S5 | Author | Course builder | Module/lesson syllabus builder | [`author/02-course-builder-outline.png`](./author/02-course-builder-outline.png) |
| **P23** | `/teach/:courseId/content/theory/:stepId` | S5 | Author | Theory editor | Markdown theory step editor | [`author/03-step-editor-theory.png`](./author/03-step-editor-theory.png) |
| **P23** | `/teach/:courseId/content/video/:stepId` | S5 | Author | Video editor | Video link & transcript editor | [`author/04-step-editor-video.png`](./author/04-step-editor-video.png) |
| **P24** | `/teach/:courseId/content/quiz/:stepId` | S5 | Author | Quiz editor | Quiz question & options editor | [`author/05-step-editor-quiz.png`](./author/05-step-editor-quiz.png) |
| **P25** | `/teach/:courseId/content/python/:stepId` | S5 | Author | Python exercise editor | Test cases, hints, & limits editor | [`author/06-step-editor-python.png`](./author/06-step-editor-python.png) |
| **P26** | `/teach/:courseId/preview` | S4 | Author | Student preview | Preview shell from student lens | [`author/07-student-preview.png`](./author/07-student-preview.png) |
| **P27** | `/teach/:courseId/publish` | S5 | Author | Review publication | Publication validation checklist | [`author/08-publish-review.png`](./author/08-publish-review.png) |
| **P28** | `/teach/:courseId/students` | S5 | Author | Students and invitations | Enrolled students & invite links | [`author/09-roster-students.png`](./author/09-roster-students.png) |
| **P29** | `/teach/:courseId/students/:enrollmentId` | S5 | Author | Student detail | Individual student inspection | Accessible in roster |
| **P30** | `/teach/:courseId/analytics` | S5 | Author | Course analytics | Step attempts & dropoff rates | [`author/10-course-analytics.png`](./author/10-course-analytics.png) |
| **P31** | `/teach/:courseId/settings` | S5 | Author | Course settings | Title, visibility, prerequisites | [`author/11-course-settings.png`](./author/11-course-settings.png) |
| **P32** | `/admin` | S6 | Admin | Operations overview | System status & operations health | [`admin/01-operations-overview.png`](./admin/01-operations-overview.png) |
| **P33** | `/admin/users` | S6 | Admin | Users and capabilities | User management table | [`admin/02-users-management.png`](./admin/02-users-management.png) |
| **P33** | `/admin/users/:userId` | S6 | Admin | User detail | Moderation & capability controls | [`admin/03-user-detail.png`](./admin/03-user-detail.png) |
| **P34** | `/admin/courses` | S6 | Admin | Courses administration | Course moderation table | [`admin/04-courses-management.png`](./admin/04-courses-management.png) |
| **P34** | `/admin/courses/:courseId` | S6 | Admin | Course detail | Course suspension & version detail | [`admin/05-course-detail.png`](./admin/05-course-detail.png) |
| **P35** | `/admin/categories` | S6 | Admin | Categories administration | Category management list | [`admin/06-categories-management.png`](./admin/06-categories-management.png) |
| **P36** | `/admin/reports` | S6 | Admin | Reports and issue triage | Exercise issue reports table | [`admin/07-reports-triage.png`](./admin/07-reports-triage.png) |
| **P37** | `/admin/media` | S6 | Admin | Media operations | Asset quarantine & storage stats | [`admin/08-media-operations.png`](./admin/08-media-operations.png) |
| **P38** | `/admin/execution` | S6 | Admin | Execution operations | Queue health & runner pause toggle | [`admin/09-execution-operations.png`](./admin/09-execution-operations.png) |
| **P39** | `/admin/audit` | S6 | Admin | Audit log | Operations audit event trail | [`admin/10-audit-log.png`](./admin/10-audit-log.png) |
| **P40** | `/help` | S1 | Public | Help and reporting | FAQ & support options | [`public-shared/08-help.png`](./public-shared/08-help.png) |
| **P41** | `/privacy` | S1 | Public | Privacy Policy | Legal privacy notice | [`public-shared/09-privacy.png`](./public-shared/09-privacy.png) |
| **P41** | `/terms` | S1 | Public | Terms of Service | Legal terms notice | [`public-shared/10-terms.png`](./public-shared/10-terms.png) |
| **P42** | `/access-denied` | S1 | Public | Access Denied | 403 Forbidden state | [`public-shared/11-access-denied.png`](./public-shared/11-access-denied.png) |
| **P42** | `/not-found` | S1 | Public | Page Not Found | 404 Not Found state | [`public-shared/12-not-found.png`](./public-shared/12-not-found.png) |
| **P43** | `/settings/ai-connections` | S3 | Author | AI connections | MCP connection token list | [`author/12-ai-connections.png`](./author/12-ai-connections.png) |
| **P44** | `/settings/ai-connections/:connectionId/setup` | S3 | Author | Setup and verification | Connection setup documentation | Accessible via view setup button |
| **P45** | `/teach/:courseId/activity` | S5 | Author | Agent activity & drafts | Recovery revisions & mutations | [`author/13-agent-activity-drafts.png`](./author/13-agent-activity-drafts.png) |
