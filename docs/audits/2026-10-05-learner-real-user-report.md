# ZUR learner real-user audit

**Date:** 2026-10-05  
**Scope:** learner-facing course discovery, enrollment, lessons, quizzes, Python execution, attempts, progression, reporting, appearance, and desktop accessibility/usability.  
**Result:** Across the original 53-action run and an 8-action targeted supplemental run, 60 observations passed and 1 failed; 0 actions were blocked. One contextual-reporting defect was reproduced. The run did not cover author/teacher CRUD, course editing/deletion, or administrative functions; those belong to a separate audit. Concurrent draft conflict and an infrastructure-failure retry after a worker has leased a job remain untested.

## Setup and method

I started an isolated seeded API, Vite app, execution worker, and temporary SQLite database. I created and enrolled a fresh fixture learner through the visible site UI; credentials and course state were disposable. I used a dedicated Chrome profile, Chrome DevTools Protocol mouse clicks, keyboard events, and inserted keystrokes into the visible CodeMirror editor. The runner results were checked against execution-job rows in the isolated database. No shared learner drafts, submissions, or course progress were changed.

The view was 1440×900 throughout, in both dark and light themes. No mobile, zoom, or shared production data was used. The original action log is [actions-results.json](../../screenshots/audit-2026-10-05/learner/actions-results.json); targeted supplemental results are [supplemental-actions-results.json](../../screenshots/audit-2026-10-05/learner/supplemental-actions-results.json). Combined counts are in [summary.json](../../screenshots/audit-2026-10-05/learner/summary.json). Screenshots below are from those isolated runs.

## Findings by learner flow

| Feature | Result | Evidence / notes |
|---|---|---|
| Public course catalog and search | PASS | Catalog displayed Python foundations; typing a title retained the query and found the course. [Catalog](../../screenshots/audit-2026-10-05/learner/catalog_dark_dark.png) |
| Course overview, sign-in, enrollment | PASS | Signed in as the disposable learner through the course CTA, enrolled through the UI, and opened the learner course overview. Enrollment showed 0 of 7 required steps. [Course overview](../../screenshots/audit-2026-10-05/learner/course_overview_desktop_dark_dark.png) |
| Course outline and lesson navigation | PASS | Outline listed the seven required theory, video, quiz, and Python steps across three modules; selecting a step opened it. Completed status appeared after progression. [Outline](../../screenshots/audit-2026-10-05/learner/course-outline_dark_dark.png) |
| Theory | PASS | Reading content rendered; the completion action advanced to video. The Copy control responded to a click. Clipboard contents were not independently read, so clipboard correctness is not confirmed. [Theory](../../screenshots/audit-2026-10-05/learner/theory_dark_dark.png) |
| Video | PASS, limited | Player iframe URL and transcript were present and completion advanced to the quiz. Actual playback/audio from the external YouTube host was not independently verified. [Video](../../screenshots/audit-2026-10-05/learner/video_dark_dark.png) |
| Single- and multi-select quizzes | PASS | Wrong single-choice selection showed inline incorrect feedback; correct selection showed explanation and progression. Multi-select accepted the two true expressions and showed correct feedback. |
| Python editor and real typing | PASS | Replaced the starter code by clicking the visible CodeMirror editor, Ctrl+A, then typing. The read-only source mirrored the visible draft; save indicator and isolated database confirmed autosave. Editor was editable. [Python workspace, dark](../../screenshots/audit-2026-10-05/learner/python_workspace_dark_dark.png) |
| Run samples before submission | PASS | Wrong output returned `WRONG_ANSWER`; valid source passed samples while not submitted. Each tested error preserved a visible result. [Wrong answer](../../screenshots/audit-2026-10-05/learner/result_python_wrong_answer.png) |
| Custom stdin / run own code | PASS | Entered `21` in Custom input, used Ctrl+Enter, and observed successful output `42`. Switching Results → Custom input retained `21`. The job completed in the actual worker before the result was counted. |
| Syntax, runtime, and limits | PASS, with one behavior to clarify | `if :` returned `SYNTAX_ERROR`; `raise ValueError("boom")` returned `RUNTIME_ERROR`; `time.sleep(10)` returned `TIME_LIMIT` after about 5.2 seconds. A busy loop (`while True: pass`) returned `MEMORY_LIMIT` after about 2.2 seconds. This audit cannot tell whether the busy loop truly exhausted memory, but the differing verdicts may surprise learners. [Syntax error](../../screenshots/audit-2026-10-05/learner/result_python_syntax_error.png), [runtime error](../../screenshots/audit-2026-10-05/learner/result_python_runtime_error.png), [busy loop](../../screenshots/audit-2026-10-05/learner/result_python_infinite_loop_timeout_limits_.png), [wall timeout](../../screenshots/audit-2026-10-05/learner/result_python_wall_timeout.png) |
| Draft save and reload | PASS | `print(int(input()) * 2)` reached Saved, matched the disposable database draft, and was restored exactly after navigating away and back. Draft conflict across simultaneous sessions was not tested. |
| Reset confirmation | PASS | Opened the editor options, selected Reset code, received the native confirmation through CDP, accepted it, and verified the starter source returned. This was performed only in the disposable account. |
| Submit, attempts, and restore | PASS | Correct solution submission ran grading and showed All tests passed. Continue opened the next quiz. The visible Attempts tab opened the submission list; detail showed the submitted code snapshot and restore returned it to the editor. [Attempts](../../screenshots/audit-2026-10-05/learner/attempts_dark_dark.png) |
| Progress and completion | PASS | Outline showed completed steps. Correctly solved the remaining two Python steps and opened course overview showing Course Complete and all 7 of 7 required steps satisfied. [Completion](../../screenshots/audit-2026-10-05/learner/course-completion.png) |
| Report an exercise | FAIL — medium | The exercise link navigated to `/help?report=broken_exercise&stepId=step-4-python-echo`. The visible Report an issue control opened its modal after scrolling into view, but its course and step context were both blank. I filled the course ID and description manually; the form then submitted and returned a report reference. [Help page and open form](../../screenshots/audit-2026-10-05/learner/report-help-after-click.png) |
| Appearance | PASS | Dark and light preferences applied to the catalog, course overview, and workspace; light preference persisted after reload. [Catalog, light](../../screenshots/audit-2026-10-05/learner/catalog_desktop_light_light.png), [Workspace, light](../../screenshots/audit-2026-10-05/learner/python_workspace_light_light.png) |
| Desktop layout and basic labels | PASS | At 1440×900 there was no horizontal overflow; editor was writable and Run samples, Run code, and Submit solution all fit in the visible footer. Editor had accessible name “Python Source Code”; results had a labeled region; no unlabeled buttons were found by a basic DOM scan. [Final desktop workspace](../../screenshots/audit-2026-10-05/learner/python_desktop_dark_final_dark.png) |

### Supplemental journeys: failed submission and worker recovery

A second isolated, seeded SQLite fixture used the visible sign-in and exercise UI at the same 1440×900 desktop size. These eight supplemental observations passed:

- Submitted `print("wrong")` through **Submit solution**. The real job completed with `WRONG_ANSWER`; the resulting assessment attempt stored the failed verdict and exact `print("wrong")` source snapshot. [Wrong submission](../../screenshots/audit-2026-10-05/learner/supplement-wrong-submit.png)
- Opened the visible **Attempts** tab, saw **Wrong Answer** in history, opened the detail showing the snapshot, and used **Restore to editor**. The editor returned `print("wrong")`. [History](../../screenshots/audit-2026-10-05/learner/supplement-wrong-attempt-history.png), [detail](../../screenshots/audit-2026-10-05/learner/supplement-wrong-attempt-detail.png)
- Replaced the restored code with `print(int(input()) * 2)` and saved it. Stopped only the isolated worker, ran the sample action in the UI, and confirmed the job stayed `queued` with the editor source preserved. Restarted the same worker against the same disposable database without resubmitting; the queued job completed, samples passed, and source remained unchanged. [Queued during outage](../../screenshots/audit-2026-10-05/learner/supplement-runner-outage-queued.png), [recovered result](../../screenshots/audit-2026-10-05/learner/supplement-runner-recovery.png)

This verifies queued work resumes after a worker restart. It does not verify a retry after a job has been leased and then recorded as an infrastructure failure; that scenario and concurrent-draft conflict remain untested.

## Defect: exercise report loses context

From the exercise, Report an issue navigated with a `stepId`, but the opened form had empty Course ID and step context. The learner therefore has to know and manually enter a course identifier before a report can be submitted, and the report cannot identify which exercise prompted it. Submitting after filling the Course ID and description succeeded, so this is a context-prefill defect rather than a broken submission endpoint.

**Priority: P1 / medium.** Carry course, version, and step identifiers from the exercise link into the report route, prefill them in the report form, and preserve them when the form returns an error. The current form should not require learners to discover internal course IDs.

## Usability recommendations

These recommendations reflect the learner’s actual path through the 1440×900 workspace and course screens. They are separate from the defect above.

1. **P1 — Make “run before submit” unmistakable.** On the Python workspace, place one short line beside the actions: “Run samples checks the examples. Run code uses your Custom input. Submit grades the solution and records an attempt.” The existing buttons work and are visible, but the Custom input tab and Run code action are separate controls; the sentence makes it obvious that learners can experiment without submitting.
2. **P1 — Show one course-wide step position.** The outline is behind an Outline button, while lesson headers use step numbers that restart for different lesson types/modules (for example, the multi-select quiz showed Step 1 after the Python exercise showed Step 4). Add “4 of 7” beside the lesson title and a clear previous/next path. This helps learners place themselves without reopening the outline.
3. **P1 — Send exercise reports directly to a prefilled form.** The generic Help page is long and the exercise report link currently drops context. Open the report form directly with the course/step identified and a concise “Report this exercise” heading. That shortens recovery and prevents incomplete reports.
4. **P2 — Keep result modes visually tied to their run action.** Results, Custom input, and Attempts appear as tabs below the editor, while Run samples/Run code/Submit solution sit in the footer. Add a small “Current run: samples / custom input” indicator in the result pane and keep the run mode label beside its button. This prevents a learner from thinking that editing custom stdin automatically executes it.
5. **P2 — Defer solution explanation until requested.** The workspace shows a Solution explanation card before the learner has run or submitted anything. Collapse it under “Need an explanation?” or reveal it after a successful attempt, while leaving hints available on demand. This keeps the task and editor visually dominant without removing support.

The five strongest quick wins are the compact Run/Submit hints, a course-wide progress count, report context prefill, a clickable “Run code” cue in the empty output state, and hiding the solution explanation behind a brief opt-in disclosure until requested.

A simple learner journey would be: **Enroll → open the first incomplete outline step → read/watch and continue → answer and check the quiz → edit code → run samples → try Custom input and Run code → submit when ready → inspect the attempt or continue to the next step.** The tested flows support this journey; consistent progress wording and an explicit explanation of the three Python actions would make it easier to discover.

## Not covered

- Author/teacher course create, edit, and delete operations, plus administrative CRUD, were outside this learner-focused audit.
- External video playback/audio and clipboard contents were not read back from the browser.
- Concurrent draft conflict resolution and retry after a recorded infrastructure failure were not exercised. The separate worker-stop/restart queue recovery scenario is documented above.
- Screen-reader behavior and exhaustive keyboard-only navigation were not tested; the basic visible labels and editable state were checked.
- A failed **submission** attempt was not recorded in history; wrong-answer behavior was exercised with Run samples.

No application code was changed during this audit. The execution traces and screenshots are in `screenshots/audit-2026-10-05/learner/`.
