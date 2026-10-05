# Learner browser audit

Date: 2026-10-04  
Target: local ZUR app (`http://127.0.0.1:5173`, API on `:3001`) in headless Chrome  
Account: seeded learner Ada (`ada@zur.internal`)  
Scope: learner dashboard, lesson outline/navigation, Python editor, run-before-submit, custom stdin, results, attempts, progression.

## Findings

The lesson workspace supports the core loop the learner needs: edit code, run public samples or custom input, inspect output/errors, then submit for grading. In the current desktop build, the sample, custom-code, and submit buttons are all visible in the footer. At 390 × 844, the editor remains editable and the actions remain visible, with Submit wrapping to a second row. The initial concern that learners cannot run before submitting is resolved in the current build.

The current lesson page presents the task, input/output requirements, constraints, hint, editor, Results / Custom input / Attempts tabs, and the three actions. “Run code” executes immediately on its first click using the current custom-input field value (empty by default); it does not require clicking twice to reveal an input box. To set stdin, select the Custom input tab, enter input, and click Run code. The entered value remains when switching to Results and back.

## Actions and evidence

| Area | Browser action | Observed result |
|---|---|---|
| Workspace at desktop | Open Ada’s step 4, “Echoing Numbers,” at 1440 × 900 | Two-pane problem/editor workspace rendered. Run samples, Run code, and Submit solution were visible and enabled in the bottom action row. Editor was editable. See [desktop screenshot](../screenshots/learner-audit-desktop.png). |
| Workspace at mobile | Resize to 390 × 844 | Editor remained editable; Run samples and Run code stayed on the first action row and Submit wrapped beneath. Document width remained 390 px, with no horizontal overflow. See [mobile screenshot](../screenshots/learner-audit-mobile.png). |
| Real editor typing and draft save | In a disposable SQLite/browser fixture, click into CodeMirror, send Ctrl+A via Chrome input events, and type `print(int(input()) * 2)` | The selected old code was replaced in full, the visible editor and textarea matched, and the draft reached Saved with the same code in SQLite. |
| Run code before submit | Enter a complete solution through the visible editor, then run without submitting | The sample run passed before submission. The shared UI page has separate Run samples, Run code, and Submit solution actions. |
| Sample checks | Click Run samples with `print("try")` in the earlier live probe | Returned `WRONG_ANSWER`; showed sample input `5`, expected output `10`, and received output `try`. The button was re-enabled after completion. In a disposable fixture, the real-keyboard replacement solution returned `PASSED`, expected `10`, received `10`. |
| Runtime error feedback | Run the seeded draft, which attempts `for j in i` where `i` is an integer | Returned `RUNTIME_ERROR` and displayed stderr with `TypeError: 'int' object is not iterable`. |
| Custom stdin and keyboard shortcut | In the disposable fixture, enter `21`, focus the editor, and press Ctrl+Enter | Returned `Code ran successfully`, input `21`, received output `42`. Switching to Results and back retained `21`. |
| Attempts | Open the Attempts tab / history route | History page loaded and stated “0 total attempts” for the exercise. Sample/custom runs did not appear as submissions. |
| Course outline | Open Outline on desktop | Drawer opened and listed all seven course steps with status/type/required labels and working step URLs. Earlier steps were marked Completed, step 4 Current step, later steps Not started. |
| Course outline at mobile | Open Outline at 390 px | Drawer opened and remained within the viewport; document width stayed 390 px. |
| Pass and progression | Run `scripts/verify-live-user-experience.ts` | The script created an isolated temporary database, signed Ada in, submitted the correct Echoing Numbers solution, ran it through the isolated worker, and observed `PASSED` plus step completion in the UI. It then completed its catalog, author, MCP, and admin journeys. No submission was made to the shared Ada account. |
| Mobile attempt restore | In a disposable fixture, add a synthetic attempt row, open its detail at 390 × 844, and open Restore to editor | Restore to editor and its confirmation dialog were visible and within the viewport. I cancelled by leaving the confirmation open; no restore or submission was made. |

## Defects and usability notes

- Runtime failures show the complete Python traceback, including runner file paths such as `/work/main.py`. That is useful for diagnosis, but it is a lot of implementation detail for a beginner. Consider keeping the exception type and relevant line while trimming internal runner paths and framing it as a next action.
- The lesson route title is now `Echoing Numbers · Python foundations · ZUR`, so the previously observed generic landing-page title defect is fixed there. The attempt-detail route still used the generic title `ZUR — Understand it. Then write it.` in the mobile probe; consider giving that route an Attempts-specific title.
- The Python task view still has a substantial instruction column next to the editor. The content tested here is task-specific (statement, input/output, constraints, hint), while the editor and result area stay uncluttered. The action labels are now compact and directly actionable.

## Test integrity and limits

I first exercised the shared seeded Ada draft while checking the controls. That draft was overwritten during the run-code experiment, so I restored its original visible code (`for i in range(100): ... for j in i: ...`) in `data/zur.sqlite` and advanced its revision to invalidate stale editor state. I did not submit a solution on the shared account. The successful submission verification used the repository journey script’s temporary isolated database.

The final real-keyboard probe ran against a disposable database and replaced the complete visible CodeMirror buffer with Ctrl+A plus typed text. The saved draft matched, sample execution passed, and custom input `21` produced `42` through Ctrl+Enter. The mobile attempt restore view used a synthetic row in that disposable fixture. The shared Ada draft remains restored to its original visible contents; no shared-account submission or restore was performed. No broader author CRUD or admin behavior was in this learner-only audit.
