# Interface review — 2026-10-06 captures, finalized 2026-10-08

Analysis and planning only against commit `0998ec0`. Agy was invoked through `delegate-to-agy`, with bounded disposable-fixture capture and same-conversation recovery. Codex reviewed learner → author → admin → public/account in order, saving each plan/inventory before inspecting the next group's images. All 167 fresh PNGs were independently inspected and fully decoded (56 learner, 35 author, 36 admin, 40 public). Current screenshots are saved locally in `screenshots/interface-review-2026-10-06/`; they remain ignored by Git. The manifest/hash records are committed; image binaries, temporary harnesses, provisional plans and raw success claims are excluded.

Highest-impact confirmed findings: profile draft loss on native Back/Forward; new-course title loss after failed creation; inconsistent authenticated/author failure exits; report modal focus escape on learner/Help; dead lower Help report action; duplicate author main landmarks; lost filters and attempts curriculum context. Category dialog separation and preview/detail alignment are explicitly design judgments. Existing learner split, task strip, main exit and authenticated Explore loaded/loading/error/no-match navigation are retained.

- [Learner plan](learner-plan.md) and [coverage](learner-coverage.md)
- [Author plan](author-plan.md) and [coverage](author-coverage.md)
- [Admin plan](admin-plan.md) and [coverage](admin-coverage.md)
- [Public/account plan](public-account-plan.md) and [coverage](public-coverage.md)
- [Shared components/navigation](shared-navigation-plan.md)
- [Complete route/state coverage](coverage-inventory.md), [route contract](route-contract.json), [capture manifest](capture-manifest.json), [image verification](image-verification.json), [checked interactions](checked-interaction-log.json)
- [Delegation outcome and artifact acceptance](delegation-status.json)

Selected earlier recommendations: truthful Run/Test/Submit states; stable learner curriculum/progress; actionable author validation; focused administrative confirmations; input preservation through errors; navigation/filter continuity; privacy lifecycle treated as an evidence gap. Existing recommendations were not accepted as an automatic redesign backlog.

Remaining evidence gaps include production isolated grading/runtime provenance, full enrollment and account/email/token journeys, author save conflicts and native dirty navigation, admin support expiry/mutation recovery, light modal variants and most narrower desktop routes. Fixture-ready checklists and legal-page notices do not establish production publication or substantive policies. Wrapper success is not claimed where final result is unavailable; artifacts are accepted only after independent verification. Proposed after screenshots are future acceptance requirements, not fabricated fixed-state evidence.

Earlier product commit `0998ec0` built successfully. Prior test run: 659/661 passed; two checks failed because the requested screenshot cleanup removed old evidence (`screenshots/s4_m04_python_unsaved_public_failure_1440.png` and `screenshots/evidence.json`). New captures do not silently satisfy those old evidence contracts. This review adds documentation/evidence metadata only, so product changes and a fresh implementation test pass are not claimed.
