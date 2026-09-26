# S4 audit

## Confirmed defects in tasks marked done

| Task | Severity | Unmet requirement and evidence | Recommended fix |
| --- | --- | --- | --- |
| T070 | Medium | P02 requires a content-language filter, and PRD §16 permits course content in languages other than English. Both catalog filter controls offer only `en` (`packages/web/src/pages/public/CatalogPage.ts:109–112, 266–269`), although the API accepts any `language` (`packages/server/src/services/course-service.ts:730–733`). A published course in another language cannot be selected through the UI. | Populate both language controls from available published catalog languages, preserving a selected language in the URL and mobile sheet. Add a non-English course to the catalog interaction check. |
| T077 | Medium | P32 requires an **internal-error rate** (`design.md:598`). The overview returns only a count of infrastructure-failed assessment attempts over 24 hours (`packages/server/src/services/admin-service.ts:68`), and the page labels it “Internal errors” (`packages/web/src/pages/admin/AdminPages.ts:22`). This omits other internal errors and provides no denominator or rate. | Define an operational error numerator and denominator over a stated window; show the calculated rate and unavailable state when telemetry is insufficient. |
| T081 | Low | P36 report detail must link to the exact reported course version (`design.md:616–620`). The report page renders `courseVersionId` and `stepId` as plain text, with no version-specific link (`packages/web/src/pages/admin/AdminPages.ts:46`). | Add an authorized link to the immutable reported version and step, or a version-specific support view when direct navigation is unavailable. |

## Verification and status

Reviewed S4 task/status definitions, relevant PRD sections, design page specifications, strict rules, implementation, and existing evidence. These findings come from direct code inspection; no tests were run and no product code or statuses were changed. S4 and modules M01/M04 are correctly **in progress** because T072/T086/T088/T089 are blocked and T087 is in progress. M02/M03 are marked **done**, but the T077 and T081 findings mean M03's status should be reconsidered until fixed and verified. T070 likewise prevents all completed claims in M01 from being fully accurate. Existing evidence for T072/T086–T089 was not independently revalidated.
