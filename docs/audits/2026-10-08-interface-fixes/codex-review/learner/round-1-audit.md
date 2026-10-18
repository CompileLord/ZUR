# Learner repair audit, round 1

Status: rejected pending correction. Independently inspected all 50 decoded PNGs in learner-only batches. Native disposable-browser checks: 13 passed, 5 failed. Existing production grading, runner isolation and historical receipt timing are not verified.

## Confirmed behavior failures

- L5 leaving open report by native Back cleans keyboard lifecycle: Stale report listener must not swallow Tab
- L6 cancelled Back preserves the existing Forward destination: Cancel must not discard existing forward entry or add a profile entry
- L2/L4 paged detail context, long code and restore failure preserve draft: Detail recovery context retained
- L2 restore confirmation keyboard containment and trigger return: Restore modal contains trusted keyboard focus
- L6 controlled storage denial preserves in-memory profile guard: Storage denial must not disable navigation guard

## Evidence failures

- Report error-retention images show empty descriptions, unchecked consent, and no error. They do not prove the claimed state.
- Overview service-error images show safe denial without Retry, contradicting the claimed service-error capture. Independent actual controlled503 recovery passes.
- L8 supplied job outputs and timing demonstrate controlled presentation only; they do not verify official grading. Label fixtures explicitly and remove fabricated measured timing/verification claims.
- Narrow attempt captures use short code; capture long code at 1100 too.
- Manifest must record observed URL, query, page identity, theme and dimensions rather than only requested state.

## Retained passing findings

Both Python-origin and theory-origin sidebar reload persistence pass. Authenticated overview404 and controlled503 recovery pass. Report keyboard containment and retained submission503 fields pass while mounted. Populated/empty Completed captures are now present and replace earlier provisional empty-only concern.

## Source validation

New reportContext property passed to AttemptHistoryPageOptions causes TS2353; baseline has ten other preexisting source type errors. Build and existing focused checks pass but do not establish type correctness. Add meaningful regression coverage for the failures above.
