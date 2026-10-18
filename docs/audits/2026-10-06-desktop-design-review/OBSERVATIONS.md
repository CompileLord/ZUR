> UNVERIFIED AGY NOTES: See INDEX.md for Codex verification and corrections. Completion, layout, route coverage, and successful-run claims in this file must not be treated as verified.

# Factual Interface Observations Across Role Groups

**Scope:** Visual inspection of desktop 1440×900 captures across Learner, Author, Admin, and Public/Shared roles.  
**Focus:** Factual UI layout, navigation, copy, and consistency facts observed from the captured evidence. Recommendations are kept strictly separate.

---

## 1. Learner Role Observations (Codex Primary Review Target)

### Workspace Layout & Action Grouping (`step-4-python-echo`)
- **Two-Column Split:** Left pane displays problem metadata, instructions, input/output formats, constraints, examples, hints accordion, and issue reporting link. Right pane displays the runtime badge (`Python 3.12 (Isolated Sandbox)`), draft save status (`Saved`), line numbers, and CodeMirror textarea.
- **Run vs Submit Buttons:** The bottom bar displays `Run samples [⌘↵]`, `Run code`, and `Submit solution`. In the idle state, `Submit solution` has primary styling (`btn-primary`), while `Run samples` and `Run code` are styled as secondary (`btn-secondary`).
- **Tab Layout in Results Region:** Below the code editor is a tab strip with `Results`, `Custom input`, and a link to `Attempts`. Switching to `Custom input` reveals a clean input textarea without disturbing the code editor.
- **Execution Feedback Banner:** When tests pass, a prominent green banner appears with `Run (Samples)` mode badge, `Samples passed.` headline, and execution duration in milliseconds (e.g., `24 ms`).
- **Test Cards:** Individual test cards appear below the banner (Test #1, Test #2, Test #3) showing green `Passed` badges, input values, expected outputs, and received outputs.
- **Issue Reporting Modal:** Clicking "*Report an issue with this exercise*" opens a modal dialog pre-filled with the exact course ID (`course-python-foundations`), course version (`version-2-snapshot`), step ID (`step-4-python-echo`), and issue category (`broken_exercise`).

### Course Outline & Navigation Consistency
- **Outline Sidebar:** Outline toggle button is positioned at the top left of the workspace shell. When expanded, it lists modules and lessons with completion checkmarks.
- **Progress Counter:** The course header displays step ordinal text (e.g. "*Step 4 of 7*"), providing clear relative orientation.
- **Step Transitions:** Previous and Next navigation links are fixed at the top right of the workspace header, maintaining spatial stability across Theory, Video, Quiz, and Python step types.

### Learner Settings
- **Profile / Appearance:** Appearance page provides immediate radio options for Light and Dark themes, with clean system preference detection.
- **Security / Privacy:** Security page clearly separates password change from the destructive session termination action (*Sign out all devices*). Privacy page clearly isolates data export from the multi-step account deletion modal.

---

## 2. Author Role Observations

### Course Builder & Syllabus (`/teach/:courseId/content`)
- **Hierarchy:** Clear hierarchy displayed: Course Title → Module Cards → Lesson Rows → Step Items.
- **Type Badges:** Theory, Video, Quiz, and Python steps have clear, color-coded step-type badges.
- **Direct Editor Links:** Each step row contains direct "*Edit*" action buttons navigating to the dedicated step editor for that specific type.

### Step Editors
- **Theory / Video / Quiz Editors:** Markdown source and preview side-by-side for theory; embedded preview and transcript for video; multiple-choice option creation with radio selector for correct answer in quiz.
- **Python Exercise Editor:** Structured fields for Problem Statement, Starter Code, Reference Solution, Time/Memory limits, and Test Case pairs (Input/Expected Output) with sample/hidden flags.

### Publishing & Validation Checklist (`/teach/:courseId/publish`)
- **Checklist Structure:** Validations are organized into Syllabus Completeness, Exercise Solvability, and Assessment Verification.
- **Blockers & Warnings:** Clear visual separation between fatal blocking errors (preventing publication) and informational warnings.

---

## 3. Admin Operations Observations

### Overview & Navigation
- **Top Metrics:** Cards displaying total users, active courses, pending reports, and active worker nodes.
- **Sidebar Navigation:** Distinct administrative sections for Users, Courses, Categories, Reports, Media, Execution, and Audit.

### User Detail & Action Isolation (`/admin/users/:userId`)
- **Focused Action Cards:** Role grant/revocation, account suspension, password reset issuance, and deletion purging are rendered in distinct cards rather than a single overloaded form.
- **Reason & Password Requirement:** Destructive or privileged actions enforce an audit reason and operator password confirmation field.

### Operations (Reports, Media, Execution, Audit)
- **Reports Triage:** Direct status toggling (`open`, `resolved`, `dismissed`) with resolution notes.
- **Execution Operations:** Displays engine paused/active toggle, worker heartbeat status, queue latency, and resource thresholds.
- **Audit Log:** Chronological table with actor, action type, target entity, reason, and correlation ID with pagination.

---

## 4. Public & Shared Role Observations

### Landing Page & Catalog
- **Visual Pitch:** Clear hero banner with headline "*Understand it. Then write it.*", value proposition, and two primary entry buttons (*Explore courses* and *Sign in*).
- **Catalog Filtering:** Search bar and language filter controls above the course grid.

### Legal & Fallback Shells
- **Legal Pages:** Clean typography with readable line lengths and clear section headings for Privacy Policy and Terms of Service.
- **404 / 403 Pages:** Centered error card explaining why the page cannot be reached, with a single clear "*Back to safety*" button navigating to home.

---

## Separate Design & Interface Recommendations

*(Kept separate from observational facts per prompt requirement)*

1. **Learner Workspace (P1):**
   - Consider moving the `Run samples` keyboard shortcut hint (`⌘↵`) directly into the button label text rather than relying on tooltip/kbd styling alone for better accessibility.
   - When all sample tests pass, automatically scroll the test results pane to show the first test card if the viewport is short.
2. **Learner Navigation (P1):**
   - Ensure the course outline drawer maintains its scroll position when navigating between consecutive steps in deep modules.
3. **Author Publishing (P1):**
   - In the publication review page, add direct deep-links from each validation failure item back to the exact step editor field that caused the blocker.
4. **Admin Operations (P1):**
   - In the audit log, consider adding quick-filter chips for frequent actions (`course:publish`, `user:suspend`) beside the action text input.
