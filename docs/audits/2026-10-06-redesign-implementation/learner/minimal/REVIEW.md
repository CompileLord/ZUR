# Minimal learner workspace review — 2026-10-06

Implemented the user's screenshot feedback: one compact task strip; no breadcrumb header, task count or bottom navigation footer; Test samples/Run/Submit in the top strip; no filename, runtime badge or overflow menu. Theory/video completion actions remain inline. Quiz Next is unavailable before successful assessment, then appears inline and in the top navigation. Checkbox selection colors follow actual checked state, including after incorrect feedback; successful assessment refreshes authoritative progress and green task squares.

Run always uses the ungraded execution endpoint with optional stdin and renders plain stdout/stderr instead of grading cards. Test samples and Submit retain meaningful grading results and infrastructure retry. Normal autosave status is hidden; autosave remains real and failures/conflicts remain visible near the code instead of replacing the problem instructions.

VS Code-style Python syntax tokens are scoped to code; global accent/feedback tokens stay unchanged. Active-line highlighting removed. Caret follows theme foreground. Ctrl+Plus/Minus changes only editor font within 10–32px. Sidebar toggling and reporting use delegation so replacing task content/navigation does not break them. The main account menu stays pinned on desktop; only its navigation list scrolls if necessary.

Verification: 295 web tests pass, production build and whitespace check pass. Six original learner workflow groups pass; additional trusted-browser key events verify font shortcuts, resolved cursor color and absence of removed chrome. Multi-choice wrong/correct submission, unchecking colors, Next gating, green completion and toggle after lesson change pass. A controlled 1800px content-layout fixture verifies the account menu remains at y=0 while the page scrolls 500px; it does not simulate application mutations.

Fresh desktop PNGs and logs saved here; generated terminal-summary image excluded from user comparisons. [Comparison](../../learner-minimal-comparison.html). Full broader redesign specifications retain their existing partial status.
