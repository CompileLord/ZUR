# Desktop screenshot evidence

Captured by delegate-to-agy; recovered and checked by Codex on 2026-10-06. Agy ended with a model-service network timeout; the saved capture files survived.

**57 verified PNG files**: learner 17, author 13, admin 12, public/shared 15. Fifty files are 1440×900; seven are full-page images captured at 1440 desktop width. No mobile captures. PNG decoding, sizes, hashes, and links checked; this does not establish successful rendering of every page.

The first review covered only the 15 learner viewport images. At the user’s subsequent request, Codex reviewed the remaining groups separately: 13 author viewport images, eight admin viewport images and two full-page detail images, and nine public/shared viewport images and three full-page images. This covers 50 distinct page/state captures across the two passes. Seven redundant viewport/full-page counterparts were not opened. See [reviewed files](reviewed-files.json) for the exact file inventory.

**Evidence corrections:** learner video shows an unavailable embedded player; run feedback shows a queued job and Saving…, not passed tests; the report dialog is on /help, reached from the exercise. Completed-run feedback, passed/failed submission states, and an expanded learning sidebar were not captured. The original agy observations and route inventory are unverified agent notes, not acceptance results.

The sandbox prevented binary output directly into the repository. Codex copied the PNGs from /tmp/zur-desktop-captures into these role folders. Capture times and routes below come from agy metadata, with the learner feedback label corrected after visual inspection.

See the [master design plan](../2026-10-06-interface-redesign-plan.md), [author plan](../2026-10-06-author-interface-plan.md), [admin plan](../2026-10-06-admin-interface-plan.md), [public/shared plan](../2026-10-06-public-interface-plan.md), [file checks](verified-files.json), and [raw metadata](capture-metadata.json).

**Additional review corrections:** author preview duplicates its title and differs from learner rendering; Python author tabs and publish Edit links already exist; publishing shows seven INTERNAL_ERROR blockers. Admin user detail contains simultaneous action forms, rather than isolated action dialogs. Reports, media, and audit captures show empty lists. Policy pages show pending notices with internal engineering copy, not published legal documents. Access denied lacks the shell shown by Not found. The execution list later shows the captured sample job as Completed, which does not establish its test verdict or confirm correct learner feedback.

## learner

| Screenshot | Route | Captured UTC | State |
|---|---|---|---|
| [01-learner-dashboard.png](learner/01-learner-dashboard.png) | `/learn` | 2026-10-06T03:59:39.079Z | learner home dashboard |
| [02-my-courses.png](learner/02-my-courses.png) | `/learn/courses` | 2026-10-06T03:59:39.659Z | my courses list |
| [03-course-outline.png](learner/03-course-outline.png) · [full page](learner/03-course-outline__full.png) | `/learn/enr-ada` | 2026-10-06T03:59:40.553Z | course outline & progress |
| [04-step-theory.png](learner/04-step-theory.png) | `/learn/enr-ada/steps/step-1-theory` | 2026-10-06T03:59:41.143Z | theory lesson step |
| [05-step-video.png](learner/05-step-video.png) | `/learn/enr-ada/steps/step-2-video` | 2026-10-06T03:59:41.732Z | video lesson step; player unavailable in capture |
| [06-step-quiz.png](learner/06-step-quiz.png) | `/learn/enr-ada/steps/step-3-quiz-single` | 2026-10-06T03:59:42.320Z | single-choice quiz step |
| [07-python-workspace-editor.png](learner/07-python-workspace-editor.png) | `/learn/enr-ada/steps/step-4-python-echo` | 2026-10-06T03:59:42.916Z | python coding split view |
| [08-python-workspace-custom-input.png](learner/08-python-workspace-custom-input.png) | `/learn/enr-ada/steps/step-4-python-echo` | 2026-10-06T03:59:43.362Z | custom input tab active |
| [09-python-workspace-run-feedback.png](learner/09-python-workspace-run-feedback.png) | `/learn/enr-ada/steps/step-4-python-echo` | 2026-10-06T03:59:43.718Z | Queued for checking; no terminal result captured |
| [10-python-workspace-report-modal.png](learner/10-python-workspace-report-modal.png) · [full page](learner/10-python-workspace-report-modal__full.png) | `/help?report=broken_exercise&courseId=course-python-foundations&courseVersionId=version-2-snapshot&stepId=step-4-python-echo` | 2026-10-06T03:59:44.717Z | exercise report issue modal |
| [11-submission-history.png](learner/11-submission-history.png) | `/learn/enr-ada/steps/step-4-python-echo/attempts` | 2026-10-06T03:59:45.310Z | submission history |
| [12-settings-profile.png](learner/12-settings-profile.png) | `/settings/profile` | 2026-10-06T03:59:45.899Z | learner profile settings |
| [13-settings-appearance.png](learner/13-settings-appearance.png) | `/settings/appearance` | 2026-10-06T03:59:46.486Z | appearance settings |
| [14-settings-security.png](learner/14-settings-security.png) | `/settings/security` | 2026-10-06T03:59:47.063Z | security settings |
| [15-settings-privacy.png](learner/15-settings-privacy.png) | `/settings/privacy` | 2026-10-06T03:59:47.667Z | privacy & account requests |

## author

| Screenshot | Route | Captured UTC | State |
|---|---|---|---|
| [01-author-dashboard.png](author/01-author-dashboard.png) | `/teach` | 2026-10-06T03:59:49.230Z | author course dashboard |
| [02-course-builder-outline.png](author/02-course-builder-outline.png) | `/teach/course-python-foundations/content` | 2026-10-06T03:59:49.819Z | course builder syllabus |
| [03-step-editor-theory.png](author/03-step-editor-theory.png) | `/teach/course-python-foundations/content/theory/step-1-theory` | 2026-10-06T03:59:50.397Z | theory step editor |
| [04-step-editor-video.png](author/04-step-editor-video.png) | `/teach/course-python-foundations/content/video/step-2-video` | 2026-10-06T03:59:50.983Z | video step editor |
| [05-step-editor-quiz.png](author/05-step-editor-quiz.png) | `/teach/course-python-foundations/content/quiz/step-3-quiz-single` | 2026-10-06T03:59:51.569Z | quiz step editor |
| [06-step-editor-python.png](author/06-step-editor-python.png) | `/teach/course-python-foundations/content/python/step-4-python-echo` | 2026-10-06T03:59:52.151Z | python exercise editor |
| [07-student-preview.png](author/07-student-preview.png) | `/teach/course-python-foundations/preview` | 2026-10-06T03:59:52.731Z | student preview mode |
| [08-publish-review.png](author/08-publish-review.png) | `/teach/course-python-foundations/publish` | 2026-10-06T03:59:53.529Z | publication review checklist |
| [09-roster-students.png](author/09-roster-students.png) | `/teach/course-python-foundations/students` | 2026-10-06T03:59:54.138Z | student roster & invitations |
| [10-course-analytics.png](author/10-course-analytics.png) | `/teach/course-python-foundations/analytics` | 2026-10-06T03:59:54.741Z | course analytics |
| [11-course-settings.png](author/11-course-settings.png) | `/teach/course-python-foundations/settings` | 2026-10-06T03:59:55.337Z | course settings |
| [12-ai-connections.png](author/12-ai-connections.png) | `/settings/ai-connections` | 2026-10-06T03:59:55.912Z | AI connections & MCP tokens |
| [13-agent-activity-drafts.png](author/13-agent-activity-drafts.png) | `/teach/course-python-foundations/activity` | 2026-10-06T03:59:56.497Z | agent activity & draft recovery |

## admin

| Screenshot | Route | Captured UTC | State |
|---|---|---|---|
| [01-operations-overview.png](admin/01-operations-overview.png) | `/admin` | 2026-10-06T03:59:58.053Z | operations overview dashboard |
| [02-users-management.png](admin/02-users-management.png) | `/admin/users` | 2026-10-06T03:59:58.656Z | users administration |
| [03-user-detail.png](admin/03-user-detail.png) · [full page](admin/03-user-detail__full.png) | `/admin/users/user-student-1` | 2026-10-06T03:59:59.571Z | user detail management |
| [04-courses-management.png](admin/04-courses-management.png) | `/admin/courses` | 2026-10-06T04:00:00.149Z | courses administration |
| [05-course-detail.png](admin/05-course-detail.png) · [full page](admin/05-course-detail__full.png) | `/admin/courses/course-python-foundations` | 2026-10-06T04:00:01.048Z | course moderation detail |
| [06-categories-management.png](admin/06-categories-management.png) | `/admin/categories` | 2026-10-06T04:00:01.628Z | categories management |
| [07-reports-triage.png](admin/07-reports-triage.png) | `/admin/reports` | 2026-10-06T04:00:02.217Z | reports triage |
| [08-media-operations.png](admin/08-media-operations.png) | `/admin/media` | 2026-10-06T04:00:02.793Z | media operations |
| [09-execution-operations.png](admin/09-execution-operations.png) | `/admin/execution` | 2026-10-06T04:00:03.392Z | execution operations |
| [10-audit-log.png](admin/10-audit-log.png) | `/admin/audit` | 2026-10-06T04:00:03.980Z | security & operations audit log |

## public-shared

| Screenshot | Route | Captured UTC | State |
|---|---|---|---|
| [01-landing.png](public-shared/01-landing.png) · [full page](public-shared/01-landing__full.png) | `/` | 2026-10-06T03:59:30.409Z | public unauthenticated landing page |
| [02-catalog.png](public-shared/02-catalog.png) | `/courses` | 2026-10-06T03:59:31.002Z | public course catalog |
| [03-course-overview-public.png](public-shared/03-course-overview-public.png) · [full page](public-shared/03-course-overview-public__full.png) | `/courses/course-python-foundations` | 2026-10-06T03:59:31.896Z | public course overview |
| [04-sign-in.png](public-shared/04-sign-in.png) | `/sign-in` | 2026-10-06T03:59:32.476Z | sign-in form |
| [05-sign-up.png](public-shared/05-sign-up.png) | `/sign-up` | 2026-10-06T03:59:33.065Z | sign-up form |
| [06-forgot-password.png](public-shared/06-forgot-password.png) | `/forgot-password` | 2026-10-06T03:59:33.646Z | forgot password form |
| [07-verify-email.png](public-shared/07-verify-email.png) | `/verify-email` | 2026-10-06T03:59:34.230Z | verify email notice |
| [08-help.png](public-shared/08-help.png) · [full page](public-shared/08-help__full.png) | `/help` | 2026-10-06T03:59:35.145Z | help & support |
| [09-privacy.png](public-shared/09-privacy.png) | `/privacy` | 2026-10-06T03:59:35.742Z | privacy policy |
| [10-terms.png](public-shared/10-terms.png) | `/terms` | 2026-10-06T03:59:36.337Z | terms of service |
| [11-access-denied.png](public-shared/11-access-denied.png) | `/access-denied` | 2026-10-06T03:59:36.930Z | access denied error |
| [12-not-found.png](public-shared/12-not-found.png) | `/not-found` | 2026-10-06T03:59:37.514Z | not found error |

## Coverage limits

Screenshots do not cover every route or interaction. Missing captures include password reset with valid token, invitation acceptance, learner attempt detail, author student detail, AI connection setup, admin report detail, and audit event detail. The /roster author alias is represented by /students. The design plan covers these routes as proposals, without claiming visual review.

The capture initiated a local learner code run and a draft save is visible. The later admin capture shows that job as Completed, but its final test verdict, resulting persisted draft, and any completion change were not independently checked. No publishing, account management, or destructive actions were authorized. Service-start details were not reliably returned before the timeout.
