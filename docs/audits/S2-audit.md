# S2 audit — implementation review (2026-09-27)

Scope: S2 tasks in `tasks.json`, checked against `PRD_V2.md`, `design.md`, and the routed application. The five findings from the initial static audit were implemented and reviewed. The Phase B browser gate passed locally, but T033 remains in progress for its wider media storage requirements.

| Finding | Disposition | Evidence |
|---|---|---|
| Author/student routes showed fixed fallback data | Closed | P08–P11 and P21–P26/P31 now load authenticated API data and perform real actions. The disposable Chrome journey created, edited, previewed, validated, and published a mixed course, invited and enrolled a learner, then completed its four required steps through the UI and real worker. Progress was 4/4 and 100% without staff database changes. The seeded course also completed 7/7 and 100%. |
| T047 manual completion bypass | Closed | Manual completion accepts only theory/video steps in the enrollment's pinned snapshot. Quiz and Python completion comes from successful grading paths. Focused tests cover assessment and unrelated-step bypasses. |
| T039 cross-course preview disclosure | Closed | Draft preview verifies the step belongs to the requested course before returning content. A cross-course denial test was added. |
| T033 unsafe image acceptance | Closed for the reported defect; wider task open | Upload now enforces 10 MiB, detects PNG/JPEG/WebP from bytes, checks dimensions and pixel budget, and requires bounded ImageMagick decode before a ready asset is stored. Tests reject malformed and truncated files. The runtime must provide `magick`; upload fails closed without it. Assets still use local filesystem storage rather than the task's object storage, and image metadata is not stripped by re-encoding. Processing/quarantine and retention need an end-to-end deployment review before T033 is done. |
| T041 publication idempotency | Closed | A SQLite receipt in the publication transaction survives service restart, scopes reuse to owner/course/payload, and rejects conflicting reuse. Tests cover restart and conflict. |

The review also found and fixed unsafe interpolation in routed S2 pages and quiz reads against mutable drafts for enrolled learners. Dynamic page data is escaped before rendering, and enrolled quiz reads/grading use the pinned published snapshot. Regression tests cover both.

Verification: `npm test` passed 511/511; `npm run build` passed. `node --experimental-strip-types scripts/verify-s2-browser-journey.ts` passed the fresh-course and seeded-course journeys and saved `screenshots/S2-audit-*.png`. The publication receipt, course builder, student overview, and 100% completion screenshots were visually reviewed. Keyboard, screen-reader, mobile-device, object-storage deployment, and image lifecycle checks remain open.
