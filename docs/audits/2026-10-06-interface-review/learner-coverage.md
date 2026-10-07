# Learner coverage inventory

Initial 45 fresh PNGs decode; 11 supplement captures are listed in [supplement manifest](learner-supplement-manifest.json). routes, timestamps, state and theme are listed individually in [manifest](manifest.json), dimensions/hashes in [verification](image-verification.json). Capture fixture: disposable seeded SQLite, temporary uploads, separate API/Vite ports and Chrome profile. Standard viewport 1440×900; one 1100×900 workspace and four desktop-width full-page captures. Prior navigation-fix images dated 2026-10-06T16:01Z were compared with current 17:29Z captures and current source. No terminal summaries or browser error pages are counted.

“Compliant” below means the described presentation/state only. Every unlisted relevant state/theme is **unverified**, not a whole-page pass. The raw executor log includes unsupported success claims; [plan](learner-plan.md) and the final checked log supersede them.

| Page / route | Reviewed state / theme | Result | Evidence filename prefix |
|---|---|---|---|
| P09 `/learn` | Continue card; dark/light; actual workspace return dark | Compliant observed state | `learner-p09-dashboard-*`, `learner-p09-return-main-*` |
| P10 `/learn/courses` | In progress dark/light | Compliant presentation | `learner-p10-mycourses-*-in-progress` |
| P10 `?filter=completed` | Dark direct requested filter | Requires L1 | `learner-p10-mycourses-dark-completed-tab-defect` |
| P11 `/learn/:enrollmentId` | Curriculum/progress dark/light and full-page | Compliant observed state | `learner-p11-course-overview-*` |
| P12 shared step route, theory | Normal dark/light; expanded after document navigation dark | Normal presentation compliant; visibility requires L3 | `learner-p12-theory-*` |
| P13 shared step route, video | Player frame/transcript dark/light | Presentation reviewed; playback unverified | `learner-p13-video-step-*` |
| P14 shared step route, quiz | Single unselected dark/light; multiple wrong/correct light | Observed selection, feedback and next-step gating compliant | `learner-p14-quiz-*` |
| P15 shared step route, Python | Split editor dark/light; narrow 1100 dark; 12 task strip/waived/completed; collapsed dark | Accepted layout retained; reload visibility L3 | `learner-p15-python-editor-*`, `*-taskstrip-*`, `*-sidebar-*` |
| P15 execution | Samples diff/custom stdout/Submit feedback/controlled infrastructure failure, dark | UI presentation reviewed; isolated backend/real retry not established | `*-samples-*`, `*-custom-*`, `*-submit-*`, `*-infra-*` |
| P15 report | Visible contextual dialog/code opt-in unchecked, dark | Presentation retained; native keyboard containment requires L5 | `*-report-modal-*` |
| P16 `/learn/:enrollmentId/steps/:stepId/attempts` | Populated list dark/light | Requires L2 | `learner-p16-attempts-history-*` |
| P16 `.../attempts/:attemptId` | Selected snapshot dark/light | Requires L2; inset judgment L4 | `learner-p16-attempt-detail-*` |
| P17 `/settings/profile` | Normal form dark/light | Normal presentation reviewed; dirty Back requires L6 | `learner-p17-settings-profile-*` |
| P18 `/settings/appearance` | Normal form dark/light | Normal presentation reviewed | `learner-p18-settings-appearance-*` |
| P19 `/settings/security` | Form/sessions dark/light | Normal presentation reviewed | `learner-p19-settings-security-*` |
| P20 `/settings/privacy` | Separate export/deletion sections dark/light | Normal presentation reviewed; lifecycle unverified | `learner-p20-settings-privacy-*` |
| P02 authenticated `/courses` | Loaded, selected Explore and search-filtered dark | Corrected shell retained | `learner-p02-explore-auth-*` |
| P03 authenticated `/courses/:courseId` | Loaded overview and full-page dark | Corrected shell retained | `learner-p03-course-overview-auth-*` |

## Explicit unavailable/unverified state inventory

- P09: no enrollments, all completed, loading, error, recovery, long multi-course list; both themes.
- P10: All/Completed real clicks and Back/Forward/reload, empty, previous/left/revoked courses, leave modal, loading/error, long list; both themes except captured Completed direct request dark.
- P11: denied/suspended/completed, loading/error/retry, module collapse persistence and long fixture content beyond available seed; both themes.
- P12/P13: completion mutation/next journey, loading/error, long prose/transcript and scroll restoration, actual playback/captions; both themes. Sidebar reset captured dark after full-document navigation only.
- P14: dark wrong/correct multiple choice, deselection after feedback, disabled/check loading, service errors, completed later failed practice, answer preservation across route/reload; both themes where not captured.
- P15: light execution/report variants, light narrow desktop, save failure/conflict recovery, runtime/stderr/timeout/limits, native shortcuts/caret checks, editor undo/cursor through route navigation, draft Back/Forward/reload, production isolated grading and real infrastructure retry; both themes.
- P16: loading/empty/error/retry, pagination/query return, denied attempt, long snapshot, restore modal/cancel/success/failure and keyboard focus; both themes.
- P17–P20: save/validation error/loading/success; native dirty guards, modal cancel/focus, preferences persistence; export ready/expired/failed and deletion blocked/confirmation/pending states; both themes. No real account deletion occurred.
- Authenticated P02/P03: light variants, loading/empty/service error/retry, no-match versus service failure, new learner enrollment and course overview denial/error; both themes.

## Reviewed navigation evidence

Workspace → `/learn` via real home link and dashboard → Explore via real sidebar link retain the app shell. Catalog → overview retains it in the loaded state. Attempts → detail works but loses curriculum. Sidebar collapsed → CDP document navigation → theory expands it. My Courses Completed direct URL keeps In progress active. Browser Back/Forward and enrollment from a fresh account were not established by this batch.

## Native supplement checked by Codex

- Report modal native Tab: **Requires L5**, focus reached BODY outside dialog. Light variant, Shift+Tab and screen-reader behavior remain unverified.
- Profile native Back/Forward: **Requires L6**, draft lost; independently repeated by Codex in another disposable account without dialogs. Other save/guard adverse states remain unverified.
- Collapsed sidebar → real SPA task square: **Compliant observed state**; full-document persistence still L3. Raw log says passed=false because it expected a defect; that is not a product failure. Screenshot `learner-p12-sidebar-spa-nav-reset.png` actually shows retained collapse.
- Authenticated catalog loading under controlled delay, 500 under controlled API failure, and real no-match query: **Compliant shell continuity**, dark/light. The loading frames retain filters/navigation; actual loaded/error recovery is not established by the image alone.
- Authenticated overview 404: **Requires L7**, dark/light. Contrary to the executor summary, these images show public Sign in navigation with no app sidebar. This is denial, not a captured 5xx error.

These statements supersede inconsistent captions and broad compliance claims in the raw supplement coverage. Remaining gaps above apply except these specifically added states.
