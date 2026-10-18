# Learner Round5 targeted visual review

Codex decoded all108 learner PNGs and directly inspected both new1440×900 restore-failure frames at full size. The dark and light frames show readable failure text inside the active foreground confirmation, clear Cancel and Retry restore controls, and preserved Attempts context behind it. These correct the two Round4 frames with invisible foreground errors; the manifest marks those historical frames superseded. Existing captures are retained rather than overwritten.

| New capture | Visual finding |
| --- | --- |
| learner/round-5/learner-l2-attempt-restore-failure-dark.png | Foreground recovery visible, coherent dark theme, clear secondary Cancel and primary Retry. |
| learner/round-5/learner-l2-attempt-restore-failure-light.png | Equivalent foreground recovery and hierarchy in light theme. |

Supplemental stable-open browser probe proves actual controlled503 and computed visibility438×40; it includes a300ms wait after Cancel. It cannot replace the original immediate Cancel→reopen check, which independently failed17/18 in the preceding run. Approval remains pending that lifecycle correction and an unchanged original-probe rerun. The executor wrapper reported ERROR with a nonempty response and exit0; saved artifacts are reviewed independently, not described as a successful delegation.
