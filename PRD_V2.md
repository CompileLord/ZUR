# ZUR — Product Requirements Document V2

Version: 2.1  
Date: September 24, 2026  
Status: Proposed product baseline for review and implementation  
Source: PRD.md

## 1. Product definition

ZUR is a coding-first learning platform that helps teachers create interactive Python courses and helps beginners learn through short explanations and exercises in the browser.

The primary product promise is: **a teacher can publish a reliable interactive programming lesson, and a student can start practicing without installing software.**

The initial product serves teacher-led groups and independent learners. Course creation, reliable assessment, and continuity of student work take priority over marketplace, community, and gamification features.

This document defines proposed product behavior. Numerical limits and performance targets are initial engineering budgets to validate during the pilot, not measured results. Business, legal, and deployment decisions that remain unresolved are listed in Section 22.

## 2. Users, problems, and intended outcomes

| User | Current problem | Required outcome |
|---|---|---|
| Teacher / course author | Building an interactive course requires too much setup and fragmented tooling. | Create, preview, validate, and publish a lesson in one workspace. |
| Beginner student | Installing tools and switching between instructions and an editor interrupts learning. | Read instructions, write Python, and receive useful feedback on one screen. |
| Returning student | Lost code and unclear progress make it difficult to continue. | Resume the correct step with saved code and trustworthy completion status. |
| Platform administrator | Unsafe execution, broken content, and access mistakes undermine trust. | Operate the platform, resolve reports, and investigate failures with limited, audited access. |

### Core journeys

1. An author creates a draft, adds a short explanation and Python exercise, checks a reference solution, previews the lesson, publishes, and invites students.
2. A student accepts an invitation or enrolls from a course page, completes a theory step, runs sample input, submits a solution, and continues after passing.
3. A student leaves mid-exercise and later resumes with the latest successfully synchronized code.
4. An author identifies an exercise with a low pass rate, reviews relevant submissions, fixes the draft, and publishes a new version with a clear policy for existing learners.

### Product principles

- Keep authoring close to document editing and practice close to a focused code editor.
- Make feedback understandable without weakening assessment privacy.
- Never silently lose work or change the grading contract for an existing attempt.
- Keep access, publication, enrollment, and progress as separate concepts.
- Prefer explicit, predictable rules over configurable complexity in the first release.

## 3. Goals and success measures

The primary outcome is repeated meaningful practice: the number of unique students who pass at least one required assessment in a seven-day period. Track practice frequency alongside course completion; neither metric alone proves learning.

| Measure | Definition | Initial pilot target |
|---|---|---|
| Author activation | Invited pilot authors who publish a validated lesson within seven days / invited pilot authors | At least 60% |
| Authoring usability | Time to publish a first theory-plus-exercise lesson using prepared content | Median at most 20 minutes in usability sessions |
| Student activation | New enrollments that submit an assessment within seven days / new enrollments in courses containing assessments | At least 60% |
| Week-two practice retention | Activated students who submit another assessment 7–13 days after activation / activated students eligible for observation | At least 35% |
| Grading reliability | Accepted submissions that reach a grading verdict without infrastructure failure / all accepted submissions | At least 99.5% |
| Work preservation | Confirmed loss of server-acknowledged author content or student code | Zero incidents |

Targets are hypotheses for a controlled pilot. Report sample sizes and observation windows; exclude staff, previews, automated checks, and test accounts. Revise targets after baseline data exists, without redefining historical results.

## 4. Release scope

P0 is required for the initial release. P1 follows pilot evidence. P2 is exploratory.

| Area | P0 — initial release | Later |
|---|---|---|
| Accounts | Verified email, sign-in/out, recovery, account settings, author access, admin controls | Social sign-in, institutional SSO |
| Authoring | Course tree, rich content, images, approved video embeds, autosave, preview, publish validation | Co-authors, reusable question bank, full-course duplication |
| Assessment | Single-choice and multiple-choice questions; Python stdin/stdout exercises | Short answers, function tasks, partial-credit grading, custom checkers |
| Practice | Desktop editor, public/custom Run, server-side Submit, hints, saved code, attempt history | Mobile coding editor, browser-local execution, advanced language services |
| Delivery | Public/unlisted/private courses, open or invitation-only enrollment, course progress | Cohorts, scheduling, deadlines, prerequisite locks |
| Teacher tools | Invitations, roster, per-student progress and submitted code, basic analytics | Bulk import, CSV exports, intervention workflows |
| Operations | Admin panel, reports, audit events, isolated runner, quotas, monitoring, recovery | Broader enterprise administration |
| Agent authoring | Author-issued access tokens; MCP course/module/lesson/step management; Markdown and image authoring; scoped publishing; activity and recovery | OAuth connection flow for clients that cannot configure bearer tokens |

### Explicitly outside the initial release

Payments, certificates, revenue sharing, native mobile apps, live classes, direct messages, forums, leaderboards, streaks, plagiarism detection, multiple programming languages, AI-generated grading, AI tutors, AI autocomplete, SCORM/LTI integrations, and organization-level permissions are excluded.

External AI agents may create and edit teaching content through the author-authorized MCP integration in Section 23. This is part of P0 and does not introduce a built-in AI tutor, chat composer, image-generation service, or AI grading system. Uploaded images may be created by the author or the author's external agent.

Native video upload/transcoding and arbitrary file attachments are also deferred. Images and approved video embeds cover the initial teaching workflow with fewer delivery and security dependencies. Media is embedded inside Theory steps; a separate Image step type is unnecessary.

## 5. Domain model and terminology

The learning hierarchy is:

```text
Course
  Module
    Lesson
      Step: Theory | Video | Quiz | Python exercise
```

Categories classify courses; they are not permission or content containers. Each course has one primary category and up to five normalized tags. Administrators manage categories. Authors select existing categories and may create tags; tags are trimmed, case-normalized, length-limited, and deduplicated.

- A course has one owner in P0.
- Modules and lessons organize content; only steps determine completion.
- A lesson contains 1–20 steps when published. Empty draft structures are allowed.
- Each published module must contain at least one lesson.
- Each step has a stable identity, type, title, position, required flag, estimated duration, and versioned content.
- Required/optional is set only on steps. Do not add conflicting required flags to lessons or modules.
- At least one required step is necessary to publish a course.
- Difficulty, content language, learning outcomes, prerequisites, and estimated duration help learners decide whether to enroll.
- Estimates are author-provided; course duration sums all step estimates and is labeled approximate.

Published step types cannot be changed in place. An author creates a replacement step instead, preserving the meaning of previous attempts and completion records.

## 6. Accounts, roles, and permissions

Student capability is available to every active account. Author capability is additive: an author can also enroll as a student in other courses. During the pilot, administrators grant author capability; unrestricted author self-service is a later decision.

| Action | Visitor | Student | Course owner | Administrator |
|---|---|---|---|---|
| Browse public course descriptions | Yes | Yes | Yes | Yes |
| View learning content | No | With active enrollment | Own courses and previews | Explicit audited support access |
| Edit and publish | No | No | Own courses | Suspend or restore availability; no routine editing |
| View a student's submitted code | No | Own submissions | Submissions in owned courses | Explicit audited support access |
| View unsent student code drafts | No | Own only | No | No routine access |
| Manage enrollment | No | Join or leave own enrollment | Invite, revoke access, reinstate | Audited support operations |
| Manage global categories and account restrictions | No | No | No | Yes |

Every API and media request enforces authorization server-side. Changing an identifier must never grant access to another course, draft, submission, invitation, or asset.

P0 account requirements:

- Verify email before enrollment, invitation acceptance, or authoring.
- Provide password recovery, generic account-recovery responses, session expiry, and sign-out from all devices. An equivalent managed authentication flow is acceptable.
- Require stronger authentication for administrators.
- Rate-limit authentication and recovery endpoints.
- Explain invitation/account email mismatches without revealing another account's details.
- An account suspension blocks new sessions and active authenticated actions; it does not silently erase learning records.

## 7. Publication, visibility, and enrollment

### 7.1 Independent controls

Publication state is `Draft`, `Published`, or `Archived`. A published course may also have unpublished draft changes. Administrative suspension is a separate availability override.

| Visibility | Discovery | Permitted enrollment policy |
|---|---|---|
| Public | Listed in the catalog; public description and syllabus | Open or invitation-only |
| Unlisted | Description available to anyone with the URL; excluded from catalog and search indexing | Open or invitation-only |
| Private | Details and content available only to owner and authorized enrolled students; a valid invitation shows a minimal acceptance screen | Invitation-only |

Unlisted links are discoverability controls, not secrets. Public and unlisted course bodies still require enrollment in P0. Their descriptions and syllabus do not expose answers, tests, or reference solutions.

Draft courses are owner-only. Archived courses accept no new enrollments and are removed from discovery; existing active enrollments may continue learning and submitting. Restoring an archive re-enables the last published release. Admin suspension blocks learning and execution, including existing enrollments, and displays a safe explanatory message.

An owner archives a published course instead of reverting it to Draft. A never-published draft can be deleted with confirmation. Published content with learning records is retained according to the retention policy.

### 7.2 Enrollment lifecycle

Enrollment states are `Active`, `Left`, and `Revoked`. Invitations are separate records, not enrollments.

- Enrollment requires a published, non-archived, non-suspended course and a verified, eligible account.
- Enrollment is idempotent: repeated joins do not create duplicate records.
- Students may leave a course. Their progress remains recoverable during retention; access stops immediately.
- A student who left can rejoin if the current enrollment policy permits it; restore their retained version and progress.
- An author can revoke access without deleting the student's account or evidence of work. Revoked students cannot bypass this by using an open enrollment link; the owner must explicitly reinstate them.
- Visibility changes do not revoke existing enrollments. Enrollment-policy changes affect future joins.
- Invite acceptance rechecks the current course and account state. An old invitation cannot reopen an archived or suspended course.

### 7.3 Invitations

Support email invitations and revocable shareable invitation links. Email invites are single-use, bound to the verified recipient email, and expire after seven days. Shareable links have an author-selected expiry, a default maximum of 30 days, and an optional use limit. Token generation must resist guessing; tokens must not appear in analytics or logs.

Authors can revoke, regenerate, and resend invitations. Resending an email invite invalidates the previous token. Link regeneration prevents future joins through the old link without removing existing students. Acceptance and use-limit consumption must be atomic.

An owner may copy an invitation link if email delivery fails. Transactional email for verification, recovery, and invitations is P0; a general notification center is not.

## 8. Authoring and publishing

### 8.1 Course creation and builder

Creating a course requires only a title. It starts as a private draft; the owner chooses category and delivery settings before publication.

The desktop builder has a structure tree, central editor, and contextual settings panel. It supports adding, renaming, duplicating, deleting, collapsing, and reordering modules, lessons, and steps. Keyboard-accessible move controls accompany drag-and-drop. Destructive actions require confirmation and describe their scope. Duplicated content receives new identities and no learner records.

Settings include course description, category, tags, difficulty, language, learning outcomes, prerequisites, and visibility/enrollment policy. Optional fields must not obstruct initial drafting.

### 8.2 Autosave and recovery

- Author content saves after approximately one second of inactivity.
- Display `Saving`, `Saved`, or `Not saved — retrying`, with a last-saved timestamp when useful.
- `Saved` means the server acknowledged the current revision, not merely that a local write occurred.
- Preserve recoverable local changes on a network interruption. Full offline course editing is out of scope.
- Warn before navigation while changes are unsynchronized; do not claim browser-close warnings guarantee recovery.
- Use revision checks to detect edits from another tab. Never silently overwrite a newer revision; offer reload or recovery of the local text.
- Publish waits for acknowledged saves and operates on the exact validated revision.

### 8.3 Preview and validation

Preview uses student rendering with a persistent preview banner. Preview runs and quiz answers never create student enrollment, progress, or analytics. Author-only tests and solutions appear only in authorized author tools.

Publishing is blocked until:

1. Required metadata is present: title, description, category, language, difficulty, and at least one learning outcome.
2. There is at least one nonempty module, each lesson contains 1–20 valid steps, and at least one step is required.
3. Images have completed processing and have alternative text or are explicitly decorative.
4. Videos use approved embeds and include a transcript or verified captions.
5. Quizzes have valid choices and answer keys.
6. Every Python exercise has at least one public test, one hidden test, and a private reference solution that passes every test under the configured runtime and limits.
7. No required media is missing or quarantined.

Validation returns linked, actionable errors. Nonblocking warnings may flag duplicate tests, absent hints, or starter code that already passes. Claims such as automatically understanding all missing edge cases or ambiguous statements are not P0 requirements.

Changing code, tests, expected output, comparator settings, runtime, or execution limits invalidates the reference-validation result. Publication must revalidate those changes. Student-visible solution explanations are separate from the private reference solution.

## 9. Course versions and change safety

Every publication creates an immutable course version. New enrollments use the latest published version. Existing enrollments remain pinned to their enrolled version in P0, preserving instructions, required steps, tests, and progress denominators.

The builder edits a mutable draft derived from a published version. Publishing swaps the latest-version pointer atomically; students must never see half of an update. Historic versions and referenced assets remain available while retained enrollments depend on them.

P0 includes no automatic or author-forced migration of active enrollments. Before publishing updates, show: `Existing students will continue on their current version. New enrollments will receive this update.` The roster and analytics expose version labels so authors can distinguish groups.

This policy favors predictable grading over live course updates. Pilot validation must establish whether that tradeoff fits teacher workflows. If a required exercise in an older version is broken, the owner can request an audited administrative completion waiver for that exact version and step, applicable to affected enrollments. A waiver includes a reason, notifies affected learners in the course UI, satisfies progress, and is reported separately from a pass. It does not alter stored code or award a passing assessment result.

Security or abusive-content incidents use suspension immediately. Corrections for future learners are published as a new release. Version migration with progress mapping is a P1 candidate; adding lessons to an already-running class is not supported in P0.

## 10. Learning experience and completion

The student dashboard prioritizes `Continue learning` and enrolled courses. Each course overview shows learning outcomes, prerequisites, syllabus, estimated duration, required-step progress, and a clear resume action.

### Navigation

- Students can navigate freely between all steps in their enrolled version; there are no prerequisite locks or deadlines in P0.
- Resume opens the last visited step. If unavailable, use the first incomplete required step, then the course overview if complete.
- Show current position, required/optional labels, and completion status. An unsuccessful latest attempt must not erase an earlier pass.
- Theory and video steps complete through an explicit `Mark complete and continue` action. Merely opening, scrolling, or playing a video does not complete it.
- Quiz steps complete after a correct submitted answer. Python steps complete after a server-confirmed pass.

### Progress rules

```text
Course progress = satisfied required steps / total required steps
```

“Satisfied” means completed or administratively waived. Display waivers separately in detail views. Optional steps do not change the denominator and have independent completion indicators. Lesson and module progress use the same rule over their descendant required steps; a section with no required steps is labeled `Optional`, not `0%` or an invalid fraction.

A course is complete when every required step is satisfied. Completion timestamps and evidence are stored. Later failed attempts do not remove completion. Display 100% only when all requirements are satisfied; use a floored percentage for incomplete courses.

P0 exposes completion and correctness, not configurable points or course grades. This removes the ambiguity of proportional quiz credit versus all-or-nothing code credit. Weighted scores require a separate later assessment design.

## 11. Content and quizzes

### Theory and media

Rich content supports headings, paragraphs, emphasis, lists, links, quotations, tables, inline code, code blocks, callouts, dividers, and images. Formula rendering is P1 unless pilot content demonstrates it is essential. Arbitrary HTML and executable embeds are not allowed.

Images support upload, paste, preview, replacement, captions, and alternative text. Initial upload budget: 10 MB per image; validate actual content type, dimensions, and processing limits. Do not allow SVG uploads in P0. Store assets outside the application database and apply access rules to private and enrolled-only material.

Video steps use a narrow allowlist of embed providers, configured by the operator. Include a title and accessible alternative. External playback failures provide a retry or transcript path. Authors are responsible for ensuring their provider settings are appropriate for the intended audience; explain that ZUR cannot make a publicly hosted third-party video private.

### Quiz behavior

Each Quiz step contains one single-choice or multiple-choice question with 2–8 options and an optional explanation. Single choice has exactly one correct option. Multiple choice has at least one correct and one incorrect option.

- Single choice passes when the selected option matches the answer key.
- Multiple choice passes only when the selected set exactly matches the key; no partial credit.
- Attempts are unlimited within abuse limits; answers are evaluated server-side.
- Before passing, show correct/incorrect feedback without disclosing the answer key.
- After passing, show the explanation and correct answer. There is no configurable answer-release policy in P0.
- Persist submitted attempts and best completion status. Correct-option metadata must not be sent in initial student content responses.

## 12. Python exercise specification

### 12.1 Author fields

Each exercise includes a title, problem statement, explicit input/output format, constraints, starter code, public examples, hidden tests, 0–3 optional hints, a private reference solution, an optional student solution explanation, an estimated duration, and runtime limits.

P0 uses one Python source file with stdin/stdout, a pinned Python 3 runtime image, and the standard library. The exact supported version is selected and displayed before pilot launch. Package installation, internet access, multi-file projects, interactive input sessions, and custom checkers are unsupported.

Each test contains UTF-8 stdin, expected stdout, and public/hidden visibility. Empty input and output are valid. A new process and clean environment are used for every test; no test can depend on a previous test's state.

### 12.2 Output comparison

The comparator is fixed in P0:

1. Normalize CRLF and CR line endings to LF.
2. Remove trailing ASCII spaces and tabs from each line.
3. Remove empty lines at the end of the output.
4. Compare the remaining text exactly, including case, leading whitespace, and internal spacing.

Thus `5` and `5\n` match; `Hello` and `hello` do not; `1  2` and `1 2` do not. There is no numeric tolerance or token-based comparison. Stderr is diagnostic output and is not compared with expected stdout. Invalid UTF-8 stdout fails with a clear output-format explanation.

### 12.3 Editor and saved code

The desktop workspace keeps the problem and code visible together, with resizable panels and a results area. Provide Python syntax highlighting, indentation, bracket matching, line numbers, undo/redo, search, keyboard shortcuts, font-size controls, and light/dark themes. Advanced Python type analysis and AI completions are not release blockers.

Code drafts save after approximately 1–2 seconds of inactivity, scoped to student, enrollment, course version, and step. Cross-tab conflicts require explicit resolution. Local recovery must be account-scoped and cleared on sign-out to avoid exposing code on shared computers. Returning on another device restores the last server-synchronized version.

`Reset code` requires confirmation and returns to starter code. Opening an older submission is read-only until the student explicitly chooses `Restore to editor`; that action replaces the current draft with confirmation.

### 12.4 Run versus Submit

| Action | Execution | Persistence | Progress impact |
|---|---|---|---|
| Run samples | Runs public tests and shows comparisons | Short-lived operational record | None |
| Run custom input | Runs once against student-entered stdin; no expected-answer check | Short-lived operational record | None |
| Submit | Grades an immutable code snapshot against public and hidden tests | Durable attempt and result | Completes step if all tests pass |

`Ctrl/Cmd + Enter` runs code when the editor is focused. Submit uses a distinct labeled action. Capturing a submission does not depend on a pending draft autosave: the request carries the exact editor code and applicable version. Subsequent edits do not change an in-flight attempt.

An accepted execution receives an identifier. Reloading reconnects to its status. Temporary submission-service failures leave the editor usable and retain code. Duplicate requests with the same idempotency key return the same attempt.

### 12.5 Results, hints, and history

Execution states are `QUEUED`, `RUNNING`, followed by exactly one terminal result: `PASSED`, `WRONG_ANSWER`, `SYNTAX_ERROR`, `RUNTIME_ERROR`, `TIME_LIMIT`, `MEMORY_LIMIT`, `OUTPUT_LIMIT`, or `INTERNAL_ERROR`.

Run-custom success means execution finished; it must not appear as an assessment pass. Tests run in defined order and grading stops at the first failure. Infrastructure failures never appear as incorrect student answers. Worker crashes trigger a bounded retry or an `INTERNAL_ERROR`; no job remains running indefinitely.

For public test failures, show input, expected output, actual output, and safe diagnostics within output limits. For hidden failures, show only a coarse verdict and guidance. Never expose hidden inputs, expected output, captured stdout/stderr, test identifiers, or per-test timing in student responses, browser events, downloads, or student-visible logs. Student code can echo its input, so merely hiding the test input field is insufficient.

Hints reveal sequentially on request with no penalty. Optional student solution explanations unlock only after passing; the private reference solution is never automatically exposed. Persist the unlock based on the recorded pass, even after a later failed attempt.

Attempt history includes timestamp, verdict, code snapshot, runtime version, and whether a failure was infrastructural. Paginate results; do not delete older attempts merely because a student exceeds 50 submissions. Retention is time-based and explicit.

## 13. Execution safety and capacity

Untrusted code runs outside the web/API service in an isolated execution environment. The same safety constraints apply to student code, reference solutions, and author previews.

```text
Browser → Application API → Durable job queue → Isolated execution workers
                 ↑                                  |
                 └──── Persisted results / status ──┘
```

Required controls include no application credentials or secrets, no host filesystem access, no cross-job state, no outbound or internal network access, a read-only runtime, bounded temporary storage, process limits, and enforced CPU, memory, wall-clock, and output limits. Student code must not be able to read the test store or expected-answer files. Sandboxes are destroyed after execution, including timeout and crash paths.

Initial budgets to validate under load:

| Resource | Proposed starting limit |
|---|---|
| Source code | 64 KiB |
| Test count | 50 per exercise |
| Stdin or expected stdout | 64 KiB each per test |
| CPU time | 2 seconds per test by default; administrator ceiling of 5 seconds |
| Wall time | 5 seconds per test; 60 seconds for a complete job |
| Memory | 128 MiB by default; administrator ceiling of 256 MiB |
| Captured stdout + stderr | 64 KiB per test |
| Temporary disk | 16 MiB per sandbox |
| Child processes | Disabled for P0 exercises |
| Run rate | 10 requests/minute per student |
| Submit rate | 5 requests/minute per student |
| Active jobs | Two per user across queued and running work |

Authors can select limits only within the supported envelope. Validation checks the aggregate test budget; the total-job timeout is surfaced as `TIME_LIMIT`, not a wrong answer. Enforce per-account limits alongside broader abuse protections, without relying exclusively on IP limits that would block a classroom sharing one connection.

Use bounded queues, fair scheduling, provider-independent admission limits, and retry hints during overload. Reject excess jobs before acceptance; never bill them as attempts or mark them wrong. Provide an operator kill switch that disables new execution while keeping content and saved code accessible.

The runner technology is an implementation decision requiring an isolation review and adversarial testing. A container or named execution product alone is not evidence that these requirements are satisfied.

## 14. Teacher visibility and analytics

The owner roster supports searching within their own course, viewing enrollment/version status, inviting, revoking, and reinstating students. Student details show required-step progress, last learning activity, completion, waivers, and submitted assessment attempts. Do not expose other enrollments, unsent code drafts, IP addresses, or unrelated personal data.

| Metric | Exact definition |
|---|---|
| Active enrollments | Enrollment records currently in Active state |
| Learning-active students | Active enrolled students with a step completion or assessment submission in the last seven days |
| Completion rate | Completed active enrollments / all active enrollments, shown with counts |
| Average progress | Mean required-step progress of active enrollments, including zero-progress students |
| Exercise pass rate | Distinct students with a passing submission / distinct students with at least one non-infrastructure submission |
| Attempts to pass | Median non-infrastructure submissions up to first pass among students who passed |
| Last learning activity | Most recent content completion or assessment submission timestamp |

Show denominators, date ranges, and course-version filters. Separate waivers and excluded infrastructure failures. Do not combine different exercise revisions into a single difficulty metric by default. Missing data displays `No activity yet`, not misleading zero-success conclusions.

Product analytics events include course creation, publication, enrollment acceptance, step completion, run request, submission result, hint reveal, and course completion. Include pseudonymous identifiers and necessary version metadata, never code, test data, invite tokens, email addresses, or free-text content in analytics payloads. Operational and product analytics have separate access policies.

## 15. Administration, support, and privacy

The P0 admin interface provides user suspension, author grants, course suspension/restoration, category management, invitation support, execution health, report triage, and audit search. Access to learner records requires a stated support reason and creates an audit event.

Students can report a broken exercise or inappropriate course content through a private report form. Capture course/version/step context automatically; code inclusion is optional. Reports have `Open`, `Investigating`, and `Resolved` states. A support contact is available outside authenticated flows. No public comments or direct messaging are required.

Collect only essential account information. Display a chosen name; do not publish student email or offer a global student directory. Course owners see only the minimum roster data needed to manage their courses. Uploaded content must be sanitized, assets checked before serving, and download URLs authorized and short-lived where applicable.

P0 must include account export and deletion requests, with a manual audited support process acceptable for the pilot. Public launch requires an approved retention/deletion schedule covering code, attempts, local caches, logs, email invitations, course assets, exports, and backup expiry. Deleting a course or account must account for references from enrolled students and immutable versions. Resolve sole-owner courses through transfer or archival before owner deletion; do not silently orphan them.

Proposed pilot retention baseline, subject to review: operational run payloads at most 24 hours, infrastructure logs 30 days with sensitive payloads excluded, submissions while the enrollment is retained, and deleted-account personal data purged from active systems within 30 days after verification. Define backup expiration separately and prevent restored backups from reactivating deleted data. Do not present these proposals as legal requirements.

The intended launch countries, learner age range, and any school/guardian enrollment process must be resolved before enabling that audience. This PRD does not determine jurisdiction-specific legal obligations. If the appropriate process for minors is unresolved, restrict the pilot to an eligible adult audience rather than assuming consent from course enrollment.

## 16. UX and accessibility requirements

Use a restrained visual system with clear typography, consistent spacing, visible primary actions, and contextual controls. Support light/dark themes in shared design tokens. Correctness and status must be understandable without relying on color.

- All core flows support keyboard navigation, visible focus, accessible names, and sensible focus restoration after dialogs.
- Reordering has a keyboard alternative; code editing must not trap keyboard users.
- Dynamic save, submission, and validation results are announced accessibly without repeatedly interrupting the user.
- Respect reduced-motion preferences and support text enlargement and 200% zoom.
- Media provides text alternatives; author validation helps enforce these requirements.
- Target WCAG 2.2 AA and validate core journeys with keyboard and screen-reader testing; a visual checklist alone is insufficient.
- Mobile supports catalog, enrollment, theory, video, quizzes, and progress. Python steps show a desktop-required message while preserving navigation and access to the problem statement.
- Full course authoring and coding are desktop-first. Unsupported viewports show useful guidance and never discard work.
- The initial interface is English. Course content can be in other languages; locale-ready interface strings and Unicode input avoid unnecessary future migration.

Every main surface defines loading, empty, denied-access, offline, unavailable, and retry states. Error messages explain whether work was saved and what the user can do next.

## 17. System boundaries and data requirements

Use a modular application for account, course, enrollment, progress, and administration workflows, with a separate execution boundary. A relational store holds authoritative state; object storage holds assets; a durable queue coordinates work. Specific frameworks and providers belong in an architecture decision record, not in product acceptance criteria.

| Entity | Essential responsibility |
|---|---|
| User / capability | Identity, account status, author/admin privileges |
| Course / draft | Stable ownership, current delivery settings, editable revision |
| CourseVersion / versioned nodes | Immutable published structure and content |
| AssessmentRevision / TestCase | Immutable grading configuration and protected answer data |
| Enrollment | Student, course, pinned version, access state |
| Invitation | Token digest, scope, expiry, recipient binding, usage and revocation |
| CodeDraft | Student editor state and concurrency revision |
| ExecutionJob / Submission | Immutable request snapshot, status, ownership, idempotency key |
| AssessmentAttempt / Result | Quiz or coding verdict and authoritative evidence |
| StepProgress / CompletionWaiver | Satisfied requirements and their provenance |
| MediaAsset | Ownership, processing state, version references, access policy |
| Report / AuditEvent | Support workflow and sensitive-action traceability |
| AuthorAccessToken | Hashed credential, author, scopes, course restrictions, expiry, revocation, last use |
| AgentMutation / RecoveryRevision | Idempotent mutation receipt, actor attribution, affected draft revision, recoverable prior content |
| MediaUpload | Bounded upload session, course ownership, processing status, final asset identity |

Progress updates and stored terminal verdicts must be transactionally consistent or reconciled by an idempotent repair process. Duplicate or delayed worker results cannot award completion twice or overwrite a terminal result. Worker result authentication and version matching are mandatory.

Workers claim jobs with bounded leases; abandoned leases recover safely. Polling is an acceptable P0 status-delivery mechanism. The persisted result remains authoritative if a connection drops.

All timestamps are stored consistently and displayed in the user's local timezone. Server-side pagination is required for rosters, attempts, courses, and audit records.

## 18. Reliability and operational targets

Validate these targets at an initial pilot load of 100 concurrent learners, 20 execution requests per second sustained for five minutes, and the agreed reference exercise set. Record hardware, test distribution, and failure rates alongside measurements.

| Area | Proposed release target |
|---|---|
| Learning page usability | Main content usable within 3 seconds at p95 on the agreed baseline device/network |
| Normal API operations | p95 under 500 ms, excluding uploads, execution, and external authentication |
| Autosave | Server acknowledgment within 2 seconds at p95 after request dispatch |
| Queue latency | p95 under 3 seconds at the supported pilot load |
| Simple grading | p95 under 10 seconds for the agreed basic exercise suite |
| Availability | 99.5% monthly for core learning and submission acceptance |
| Recovery | Recovery point objective at most 24 hours; recovery time objective at most 8 hours |

Actual restore loss during a disaster is distinct from an acknowledged-write loss bug; communicate recovery limits to pilot operators. Queue overload must degrade transparently rather than appear as a student failure.

Before release, provide dashboards and alerts for queue age, stuck jobs, runner failures, resource exhaustion, autosave errors, authentication errors, email delivery, and elevated authorization denials. Use correlation identifiers without logging sensitive code or test payloads. Verify backup restoration, deployment rollback, and runner shutdown in a staging exercise.

## 19. End-to-end acceptance criteria

| ID | Scenario | Acceptance result |
|---|---|---|
| AC-01 | An author creates a course with only a title. | A private draft opens immediately and cannot be accessed by another user. |
| AC-02 | An author loses connectivity while editing and then reconnects. | Unsaved status is visible; recoverable edits synchronize without silently overwriting a newer revision. |
| AC-03 | An exercise has a failing reference solution or no hidden test. | Publication is blocked with a direct link to the issue. |
| AC-04 | An owner publishes edits while students are enrolled. | New enrollments receive the new version; existing students retain their previous content, tests, and progress. |
| AC-05 | A user guesses a private course, asset, draft, or submission identifier. | Every corresponding API and asset route denies unauthorized access without leaking protected payloads. |
| AC-06 | An invitation is expired, revoked, exhausted, or accepted by the wrong email. | No enrollment is created and a clear recovery path is shown. |
| AC-07 | A revoked student attempts to join an open course again. | Access remains blocked until explicit reinstatement. |
| AC-08 | A student runs correct code against samples. | Output is shown; progress remains unchanged. |
| AC-09 | A student submits code twice with the same request key. | One logical attempt is stored and completion is applied at most once. |
| AC-10 | Student code echoes hidden input before failing. | Hidden stdout, stderr, input, expected output, and test identity are absent from all student-accessible responses. |
| AC-11 | A student refreshes or changes devices after an acknowledged code save. | The last synchronized code is restored for the same version and step. |
| AC-12 | A passed student later submits an incorrect solution. | The latest verdict updates; the step and course remain complete where applicable. |
| AC-13 | A worker crashes or a job exceeds a limit. | The job reaches a bounded, accurate terminal outcome; infrastructure failure is excluded from pass-rate metrics. |
| AC-14 | Malicious code tries networking, file access, process spawning, or excessive output. | Isolation and budgets hold; the application and other jobs remain protected. |
| AC-15 | A learner completes only optional steps. | Optional completion is visible and required-step progress is unchanged. |
| AC-16 | An owner archives a course, then an admin suspends it. | Archive blocks new enrollment but permits existing learning; suspension blocks execution and learning access. |
| AC-17 | A learner uses keyboard navigation and a screen reader. | Enrollment, theory, quiz, coding, submission status, and error recovery are operable. |
| AC-18 | An owner previews and tests a draft. | No student progress, enrollment counts, or learning analytics change. |
| AC-19 | An admin waives a broken required exercise in an older version. | Only affected enrollments gain satisfied progress; the waiver is audited and never counted as a passed submission. |
| AC-20 | A deletion request completes and a backup is later restored. | Deletion records are reapplied before service resumes; deleted personal data does not reappear to users. |

## 20. Delivery sequence and release gates

### Phase A — prove safe practice

Deliver authentication, a minimal exercise model, isolated Run/Submit, protected hidden tests, code persistence, and deterministic results. Gate: malicious execution tests, output-leak tests, retry/idempotency checks, and recovery after disconnect pass.

### Phase B — prove author-to-student delivery

Deliver the builder, content/quiz steps, autosave, reference validation, versioned publication, enrollment, invitations, and completion. Gate: an author publishes a mixed lesson and an invited student completes it without staff database intervention.

### Phase C — controlled pilot

Deliver discovery, teacher analytics, reports, admin support, accessibility checks, account lifecycle, monitoring, and operational recovery. Gate: all P0 acceptance criteria pass; privacy/audience decisions are approved; load and restore targets are demonstrated.

### Phase D — refine from observed use

Prioritize P1 using pilot evidence. Leading candidates are course-version migration, function-style exercises, course duplication, co-authors, roster import/export, and better diagnostic guidance. Each addition needs a measurable problem and a defined acceptance rule.

A public launch is not approved merely because the happy path works. Required evidence includes authorization checks, accessible core workflows, stable execution, supported enrollment rules, documented recovery, and usable content from pilot authors.

## 21. Major changes from PRD V1

| Change | Reason |
|---|---|
| Defined separate visibility and enrollment policies | Public discovery should not imply unrestricted joining. |
| Made student capability additive to author access | Teachers also learn; roles should not force duplicate accounts. |
| Added immutable versions and pinned enrollments | Course updates must not silently change tests or completion requirements. |
| Required a passing private reference solution before publication | A warning alone permits exercises students cannot complete. |
| Separated private reference code from student-facing explanations | Validation data must not be accidentally published as teaching content. |
| Specified hidden-output handling | Student stdout can disclose hidden input even when input fields are omitted. |
| Removed P0 points and partial-credit ambiguity | Completion is sufficient for the initial learning model. |
| Deferred short answers and advanced editor intelligence | Their grading and integration complexity do not prove the core product. |
| Deferred native video upload and arbitrary attachments | Reduce media processing and security scope while preserving lesson delivery. |
| Replaced separate image steps with embedded media | Avoid redundant step types. |
| Added account lifecycle, invitation edge cases, and private reporting | These are necessary operational workflows, even without community features. |
| Replaced last-50-attempt deletion with explicit retention | Students and teachers need consistent evidence of learning. |
| Added success metrics, acceptance criteria, and release gates | Turn feature ideas into a testable delivery specification. |
| Removed competitor commentary, informal jokes, and unresolved citation placeholders | Keep the document self-contained, professional, and fully English. |

## 22. Decisions to resolve before implementation or launch

These decisions do not authorize extra P0 scope. Assign an owner and record the outcome before the relevant phase gate.

| Decision | Proposed baseline | Decision owner / deadline |
|---|---|---|
| Initial audience and countries | Small teacher-led pilot; enable minors only after the appropriate process is defined | Product + privacy/legal reviewer, before participant recruitment |
| Course updates during teaching | Pin existing enrollments; no automatic migration | Product, validate with pilot teachers before Phase B |
| Authentication, email, and video providers | Managed providers meeting access, privacy, and reliability requirements | Engineering + product, before integration |
| Runtime and sandbox implementation | One pinned Python 3 image and reviewed isolation boundary | Engineering + security reviewer, before Phase A gate |
| Pilot capacity and infrastructure budget | Section 18 reference load and explicit execution quotas | Engineering + product, before load testing |
| Author onboarding | Administrator-granted author access during pilot | Product, before Phase C |
| Retention, deletion, and export commitments | Section 15 proposal refined for the actual audience and deployment | Product + engineering + privacy/legal reviewer, before launch |
| Ownership of operational incidents and reports | Named support operator and escalation path | Product/operations, before Phase C |
| Business model | Free controlled pilot; no payment workflow in P0 | Product, before planning monetization |

The first release is successful when teachers can publish valid interactive lessons, students can reliably practice and resume their work, and operators can keep that experience safe and available within a documented scope.

## 23. MCP support for external AI authoring

### 23.1 Purpose and boundaries

An author can connect an external MCP-capable AI agent and delegate management of owned courses, modules, lessons, steps, assessment configuration, Markdown content, and images. Changes appear in the same drafts and Course Builder used for manual editing. MCP is an additional application interface, not a separate course database or a privileged route around validation.

The author creates the credential in ZUR and configures it in the agent's secure connection settings. The AI does not create, grant, or increase its own authorization. The integration never requires sharing the author's password or browser session.

“Full course control” means control over the author's explicitly authorized course content and delivery settings, within existing platform rules. It does not include platform administration, another author's content, student identities, rosters, submissions, account deletion, credential management, arbitrary server execution, or changing existing enrollment versions. These boundaries apply even if the author is also an administrator.

### 23.2 Connection and compatibility

P0 exposes one authenticated Streamable HTTP MCP endpoint, `/mcp`, over HTTPS in deployed environments. Local development may use loopback HTTP. Use the official MCP SDK and explicitly test supported protocol revisions; do not implement a custom JSON endpoint and describe it as MCP.

Initially support clients that allow an explicit bearer credential in their MCP connection configuration. Publish an honest compatibility matrix identifying tested client/version, HTTP transport, credential configuration, and any upload restrictions. Do not claim that every AI application accepts a manually entered token. Clients requiring an OAuth connection flow are unsupported until that flow ships.

Optional local adapters may read `ZUR_MCP_TOKEN` from the agent process environment and forward requests to the HTTPS endpoint. They must not put tokens in command-line arguments, URLs, tool input schemas, or prompts. Connection examples use placeholders, never a real token. An adapter is not a substitute for testing the target client's transport support.

Follow the [MCP transport specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports) for wire behavior. The [MCP authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) defines the interoperable OAuth route, including resource-specific tokens, authorization metadata, and bearer headers. The initial personal-token flow is explicitly a narrower compatibility option, not an implementation of that OAuth discovery flow. When OAuth is added, use the standard authorization flow and a reviewed identity provider rather than inventing a login exchange.

### 23.3 Token lifecycle and permissions

Only an active, verified author can issue a token through a reauthenticated account-settings flow. Tokens contain cryptographically random secrets with at least 256 bits of entropy; store only a lookup identifier and a secure digest. Show the secret once after creation. Token lists show a short non-secret identifier, label, scopes, course restrictions, creation/expiry timestamps, last successful use, and revoked/expired state.

Default expiry is 30 days; selectable duration is 1–90 days. No never-expiring tokens in P0. Revocation is immediate for subsequent requests and is checked again before committing long-running changes. Suspension, author-capability removal, account deletion, or loss of course ownership removes the corresponding access immediately. Regeneration issues a new credential and revokes the old one; it does not widen permissions.

An author chooses selected existing courses or all owned courses. `courses:create` separately permits new course creation; a selected-course token can access courses it creates, which are explicitly added to its allowlist and reported in the mutation receipt. It cannot add arbitrary existing course IDs to its own allowlist. All-owned access clearly includes future owned courses.

| Scope | Permission |
|---|---|
| `courses:read` | Read permitted course metadata, draft structure, and published versions |
| `courses:create` | Create a private draft owned by the authenticated author |
| `content:write` | Create/update/reorder/duplicate modules, lessons, and steps; edit Markdown, hints, tests, reference code, and explanations |
| `content:delete` | Remove draft modules/lessons/steps and delete a never-published course; retained published versions are unaffected |
| `media:write` | Upload/process images, edit image metadata, and attach/detach authorized course assets |
| `exercises:validate` | Run reference checks through the existing isolated runner and read author validation results |
| `courses:publish` | Publish an exact validated draft revision |
| `courses:manage` | Change live visibility/enrollment settings, archive, or restore authorized courses |

Provide `Read only`, `Draft authoring`, and `Full course control` presets. Draft authoring includes read/create/write/media/validation; deletion, publishing, and live delivery changes are opt-in. Full course control includes all listed scopes and shows those consequences before issuance. A valid grant authorizes repeated actions within its scope; do not require an additional manual UI approval for every tool call. Publishing still requires a valid revision and successful validation. Token scope expansion requires a new author-approved grant, never an agent tool call.

### 23.4 Tool surface

Tools use structured schemas, bounded inputs, descriptions, and appropriate read-only/destructive annotations. Annotations help clients present actions; enforcement remains server-side. `author_id` and ownership are resolved from the credential, never trusted from model input.

| Tool | Required behavior |
|---|---|
| `get_author_context` | Return safe author identity, granted scopes, course restrictions, upload limits, and supported content capabilities; never credential material |
| `list_courses` / `get_course` | Paginated owned-course lookup and exact draft/version reads; no cross-author search |
| `create_course` / `update_course` | Create private drafts and edit metadata with the same validation as the UI |
| `create_module` / `update_module` | Insert or rename a module under an authorized course |
| `create_lesson` / `update_lesson` | Create or update a lesson in the authorized hierarchy |
| `create_step` / `update_step` | Author Theory, Video, Quiz, or Python content with type-specific schemas |
| `move_content` | Reorder or move a lesson/step within the same course using stable parent/sibling IDs; reject cycles and invalid parent types |
| `duplicate_content` | Duplicate a module/lesson/step into the same course with new IDs and no learner records |
| `delete_content` | Remove a draft node with explicit child-deletion intent and expected revision; preserve recovery data |
| `prepare_course_changes` / `apply_course_changes` | Preview and apply a bounded, atomic batch of draft mutations |
| `create_image_upload` / `complete_image_upload` | Obtain a bounded upload capability, upload bytes, and finalize processing into an owned media asset |
| `get_image` / `update_image` | Read processing metadata; set alt text, decorative status, and caption; no ownership changes |
| `attach_image` / `detach_image` | Add/remove a stable asset reference in a draft step without deleting retained published assets |
| `validate_exercise` / `get_validation` | Check reference code against the exact assessment revision and inspect protected author results |
| `validate_course` | Return linked blocking issues and warnings for the exact draft revision |
| `publish_course` | Publish the exact validated draft revision using the same application transaction as the UI |
| `set_course_access` | Apply live visibility/enrollment changes with an explicit effect summary; preserve existing enrollment access |
| `archive_course` / `restore_course` / `delete_draft_course` | Follow the existing lifecycle and required scopes; never erase retained published records |
| `list_agent_activity` / `get_change` | Read mutation receipts and changes for authorized courses without exposing other credentials or learner data |
| `restore_draft_revision` | Apply retained prior draft content as a new revision after a conflict check; never roll back student records or a published version |

`content:write` permits restoring a draft revision. Restore additionally requires any applicable create/delete/media scopes for its actual effects; it cannot be used to bypass `content:delete`. Full-course duplication remains P1; the tool is for modules, lessons, and steps only.

`get_course` supports selecting metadata, outline, or full content with pagination/size budgets to avoid forcing the entire course into a model context. Assessment secrets require author authorization and must never be included in public resources. Provide read-only MCP resources for the content schema, supported Markdown, and connection help. Retrieved content is data, never a source of new permissions.

### 23.5 Markdown and image support

Theory, problem statements, hints, and explanations accept a documented Markdown subset: headings, paragraphs, emphasis, lists, links, blockquotes, fenced code with language labels, tables, thematic breaks, and images. Raw HTML, scripts, unsafe URI schemes, remote executable embeds, and unsupported syntax are rejected with actionable locations rather than silently rendered.

The server normalizes Markdown into the same canonical content representation as the rich editor and can export that representation back into the supported Markdown subset. Preserve image references, alt text, captions, code fences, ordering, and Unicode across UI/MCP round trips. Do not keep two independently editable sources of truth. Unsupported rich blocks must produce an explicit export warning and remain intact unless the requested operation actually replaces them.

Image flow:

1. The agent requests an upload for an authorized course, declaring byte count, allowed MIME type, and checksum.
2. ZUR returns an opaque upload ID and a short-lived, single-object upload capability, limited to that author, course, size, and content type.
3. The client uploads actual image bytes outside ordinary tool output; the author access token is never forwarded to object storage. A bounded inline-base64 tool may be provided for clients unable to perform uploads, with a 1 MiB decoded-size limit.
4. Completion checks the actual bytes, checksum, type, size, decoded dimensions, and processing state. Allow PNG, JPEG, and WebP; reject SVG, executables, malformed files, and decompression bombs. Apply the existing 10 MB image limit and a proposed 25-megapixel decoded limit.
5. A processed asset returns an ID, dimensions, and a Markdown reference such as `![Loop diagram](zur-asset:asset_id)`. The agent supplies alt text or marks it decorative, plus an optional caption. A decorative image uses empty alt text only when explicitly declared decorative in asset metadata.
6. The renderer resolves stable asset references into authorized delivery URLs. Short-lived upload/download URLs are never persisted inside lesson Markdown or published snapshots.

The Markdown resolver authorizes each referenced asset, including on preview/export. Arbitrary local paths and arbitrary external-image fetching are unsupported in P0. The agent must upload the image rather than causing the server to fetch an untrusted URL; this avoids introducing an unrestricted server-side fetch interface. Ordinary external hyperlinks are permitted after safe-scheme validation.

An image still processing, quarantined, missing, or outside the token's course scope cannot be published. Uploaded assets may be reused within their authorized course; cross-course copying requires read/write authorization on both courses and a dedicated operation added later. Detach removes a draft reference; actual deletion respects immutable-version references and retention. Uploaded content must use the same media processing pipeline as manual uploads.

### 23.6 Concurrency, bulk authoring, and recovery

Every mutation includes an idempotency key and, for existing drafts, `expected_revision`. Return the new revision and created/changed IDs. A reused idempotency key with a different request is rejected; a retry of the same request returns the original result for at least a documented 24-hour receipt window. Concurrent manual/agent edits return a structured conflict with the current revision; never use silent last-write-wins.

Bulk creation supports temporary client IDs for relationships within a batch. `prepare_course_changes` validates schema, authorization, resulting hierarchy, and limits, then returns an effect summary and a short-lived plan ID bound to the credential, request digest, course, and base revision. `apply_course_changes` rechecks authorization and revision and commits all draft changes atomically. Maximum initial batch: 100 operations and 1 MiB of text; larger courses are built in multiple explicit batches. Upload binaries separately. Drafts may be incomplete, but publication constraints are unchanged.

Plans are reviewable by the author or agent. There is no mandatory per-batch UI approval when the token already grants the needed rights. Live publication, course access changes, archival, and runner execution remain separate named operations and cannot be hidden inside a draft-content batch.

Before destructive edits or batch updates, preserve a recoverable draft revision for at least 30 days subject to the approved data policy. Restoring requires an expected current revision and creates a new draft; it does not mutate published history. If a batch changes during preparation, reject it and request re-preparation.

Mutation audit records include author ID, token ID (not secret), safe client label, tool, affected entities, prior/new revision, timestamp, outcome, and correlation ID. Keep rich content/image bytes out of general logs. Record detailed content diffs only in access-controlled draft recovery storage. Client-reported names are labels, not verified identity.

### 23.7 Execution and security requirements

Use the same domain services for UI and MCP mutations. Check credential status, author capability, course ownership, course allowlist, operation scope, referenced parent IDs, and assets on every request and before commit. A successful connection handshake is not perpetual authorization.

Validate HTTP Host and Origin according to the selected SDK/transport requirements, restrict accepted origins, and default local development to loopback binding. Reject unsupported content types and oversized requests. Redact bearer credentials, signed upload URLs, raw Markdown, reference code, and hidden tests from routine logs. Rate-limit by author and token, enforce author-wide storage and runner quotas, and give bounded retry guidance. Many tokens cannot multiply a single author's execution allowance.

Reference validation is the only execution feature; it uses the isolated Python runner. There is no shell, SQL, filesystem, browser-session, secret-reading, or arbitrary-HTTP-fetch tool. Prompts embedded in imported course content cannot grant tools more authority.

Initial operational budgets: 60 tool calls/minute per token, 10 concurrent calls per author, existing author-wide validation/execution limits, and a bounded image-upload allowance. Calibrate these during a real course-generation pilot. Permission failures disclose no unauthorized object details. Tool-domain errors include codes such as `REVISION_CONFLICT`, `VALIDATION_FAILED`, `SCOPE_REQUIRED`, `ASSET_NOT_READY`, and `RATE_LIMITED`; protocol/authentication failures use the correct MCP/HTTP error layer.

### 23.8 Author experience

Add Settings → AI connections with token creation, one-time reveal, setup instructions, scope/course summaries, last use, expiry, rotation/revocation, and activity links. A test connection reads author context only and cannot create content. The setup page explains client compatibility and distinguishes generated configuration from an actually verified connection.

The builder shows `Updated through [connection label]` with revision/time after a remote edit. If there are no local edits, offer Load update or refresh the content without moving focus unexpectedly. If there are unsynchronized changes, use the existing conflict-recovery flow. Recent agent changes open a scoped activity view with previewable diffs and Restore draft revision. Never imply that restoring undoes a publication or a live access change.

### 23.9 Acceptance and delivery gate

| ID | Scenario | Required outcome |
|---|---|---|
| MCP-01 | Author issues a course-limited token and connects a compatible client. | Client discovers tools and reads only the granted course context; no password sharing. |
| MCP-02 | Agent creates a course, modules, lessons, and every supported step type. | Content is visible and editable in the normal builder using the same data model. |
| MCP-03 | Agent uploads an image and embeds it in Markdown. | Image and alternative text survive Markdown/UI round trips and authorized student delivery. |
| MCP-04 | Token or account access is revoked while a write is pending. | The next request and any not-yet-committed mutation fail without partial changes. |
| MCP-05 | Agent supplies another author's parent/course/asset ID. | The operation is denied without cross-author data disclosure or mutation. |
| MCP-06 | A draft-only token attempts publishing, deleting, or access changes. | Each denied scope is enforced server-side; UI tool annotations alone are insufficient. |
| MCP-07 | An explicitly granted Full course control token publishes valid content. | Publication succeeds without a second per-call UI approval, after normal validation. |
| MCP-08 | A stale batch or repeated request arrives. | Conflict or idempotent original receipt is returned; no silent overwrite or duplicate nodes. |
| MCP-09 | Agent imports unsafe Markdown, malformed images, external asset URLs, or oversized data. | Inputs are rejected/limited before rendering or unrestricted fetching. |
| MCP-10 | Author restores a destructive draft change. | A new recoverable draft revision is created; published/enrolled versions remain unchanged. |
| MCP-11 | An agent creates a Python exercise whose reference solution fails. | MCP publishing is blocked exactly as it is in the Course Builder. |
| MCP-12 | A client supports OAuth-only connections. | Setup states the initial token-flow limitation; no false compatibility success. |

Deliver this capability as a first-class P0 extension to Phases B and C. Before calling it implemented, demonstrate a real SDK client creating a course with Markdown, an uploaded image, a quiz, and a validated Python exercise, then editing it concurrently with the builder and publishing with an appropriately scoped token. Specs or a token-settings mockup alone do not satisfy this gate.
