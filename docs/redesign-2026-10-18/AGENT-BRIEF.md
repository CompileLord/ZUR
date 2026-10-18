# Agent brief (self-contained) — ZUR redesign, wave 3

Repo: /home/compilelord/new/vibecoding/zur, integration branch `redesign/2026-10-18`. You work in YOUR OWN git worktree.

## First actions (in order)
1. `git reset --hard redesign/2026-10-18` (your worktree is brand new; earlier agents started from stale commits).
2. `ln -s /home/compilelord/new/vibecoding/zur/node_modules node_modules` at your worktree root ONLY. NEVER create or commit a `node_modules` symlink inside `packages/*` (that broke the main repo once). Before every commit run `git status` and make sure no symlink or untracked junk is staged; stage files by explicit path, never `git add -A`.
3. Read `docs/redesign-2026-10-18/PLAN.md` (§1, §1b, §2, §3 for your area, §6 tracker with Notes column) and `rules_strictly.md`. View the screenshots named in your task (BEFORE shots in `screenshots/redesign-2026-10-18/{learner,author,admin,public,integrated}`; wave-1/2 AFTER shots in `screenshots/redesign-2026-10-18/after/*`).

## State of the code
Waves 1–2 are merged: new palette (tokens.css), VS Code editor theme, skeleton loaders, SPA navigation helpers, branded leave dialog (`confirmLeaveDialog`), learner Home, Python workspace (drawer, outline slide-over), author shell/tree/editors, admin triage pages, settings/AI/MCP pages, public pages. Full suite baseline is **680 tests, 680 pass, 0 fail** and `npm run build` passes. Any failure is yours — never delete or weaken a test to pass; if a legitimate behavior change alters asserted markup/text, update that assertion minimally and list it in your report. If server/worker timing tests fail under load (other agents run in parallel), re-run that single file alone and say so.

## Rules
- Edit only files in YOUR ownership list. Other agents work in parallel. Need something elsewhere → describe it in your report instead.
- Keep accessibility (labels, roles, focus), `prefers-reduced-motion`, dark + light themes, desktop 1440x900 as the visual target. Match surrounding code style. No new dependencies.
- Security-sensitive server code (auth, authorization, privacy, grading isolation): add checks, never remove; every new endpoint must authenticate and authorize exactly like its neighbors and have tests for the denied cases.
- Commit only inside your worktree branch: message `<task ids>: <summary>` + trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. No push, no git config changes.

## Self-check (mandatory)
1. `npm test` (all packages) and `npm run build`; report counts and names of any failures.
2. Run the real app (disposable DB: see how `docs/audits/2026-10-06-interface-review/run-*-capture.ts` build a temp sqlite DB, migrations + seed, free port, vite, headless Chrome over CDP; adapt a copy into the scratchpad dir `/tmp/claude-1000/-home-compilelord-new-vibecoding-zur/10ca7b2a-edff-42e0-96f3-919b49908f48/scratchpad/`; recent working examples there: `w2b_full.ts`, `w2c_run.ts`, `w2d_run.mts`, `w2e.mts` — set `root` to YOUR worktree path). Seeded users: ada@zur.internal (student), guido@zur.internal (student+author), margaret@zur.internal (admin); passwords StudentPass123! / AuthorPass123! / AdminPass123!.
3. Capture AFTER screenshots 1440x900 (dark, plus light for layout changes) into `screenshots/redesign-2026-10-18/after/<task-id>/` (never into the baseline folders) and VIEW every one with the Read tool; compare with the BEFORE shot; say honestly what you see. The user requires screenshot-based verification, not assumptions. Do not claim to have verified behavior you did not exercise in the running app.

## Report format
Worktree path, branch, commit hash; files changed + short summary per task; test/build results; list of after-screenshots with your own verdict for each; what you did not do or could not verify.
