# S3 audit — open

Reviewed against `PRD_V2.md` §23.2–23.9, `design.md` §19/P43–P45, and the S3 gate in `tasks.json`. The original ten source findings prompted implementation work. Their current state is below; passing tests alone do not close the S3 delivery gate.

| Original finding | Current audit result |
|---|---|
| Official SDK and protocol revisions (T057/T068) | Code now uses official MCP SDK v2 for `2026-07-28` and official v1 Streamable HTTP for legacy clients. A real v2 `Client` connected, discovered tools, read context, and created a course through `/mcp` in the browser journey. Automated modern/legacy transport tests pass. |
| Actual image bytes and upload capability (T060/T068) | A scoped upload session, byte-upload endpoint, checksum/dimension checks, and 10 MB/1 MiB limits are implemented. The real-SDK journey uploaded PNG bytes and completed the asset. **Open:** the author Theory preview screenshot shows a broken image icon, so UI/MCP round trip and student delivery are not verified. |
| Prepare/apply batch plan (T063/T068) | Separate tools, persisted digest-bound plan, revision checks, and focused tests exist. The full real-SDK browser script has not completed its later batch step. |
| Revocation before commit (T053/T054/T063/T064) | Token status is re-read by permission checks; batch apply and publication call these checks before transaction commit. Focused revocation tests pass. A real pending-write interruption remains part of the uncompleted MCP-04 gate. |
| Image limits and attach/detach/update (T060) | Server tools and tests cover 10 MB upload, 1 MiB inline, and asset operations. **Open:** the author editor still labels upload as 5 MiB in the captured preview, and actual preview rendering fails. |
| Move/duplicate hierarchy (T059) | Tools and domain-service operations for modules, lessons, and steps were added, with focused tests. |
| Batch idempotency mismatch (T063) | Request digests are persisted; matching retries return the original receipt and changed payloads are rejected in focused SDK tests. |
| Activity list/change detail (T065) | Scoped `list_agent_activity` and `get_change` tools were added, with focused tests. |
| Host/Origin validation (T064) | Transport now checks allowed hosts and same-origin requests; tests cover rejected hosts/origins. |

## Independent checks

- `npm test`: 523 passed, 0 failed (latest run after agy changes).
- `npm run build`: passed (Vite web build).
- `git diff --check`: passed.
- `node --experimental-strip-types scripts/verify-s3-browser-journey.ts`: **failed** at course validation (`Course validation failed: []`); the script checks `valid` while the service returns `isValid`. Earlier steps issued a token in the real browser, connected an official SDK v2 client, uploaded real PNG bytes, created Theory/Video/Quiz/Python steps, and captured a builder conflict state. The conflict script sets a session flag rather than making a real unsaved edit, so it does not prove preservation. Publication and later adversarial steps did not run.
- Visual review: [image preview](../../screenshots/S3-audit-builder-theory-image-preview.png) has a broken image; [conflict state](../../screenshots/S3-audit-builder-conflict-remote-update.png) displays the unsaved-change message but is scripted with a synthetic flag. [Mobile connections](../../screenshots/S3-audit-connections-revoked-mobile-cards.png) concatenates Last used/Expires metadata and leaves a disabled Setup button on a revoked card without a clear row-level replacement action. [Mobile grant dialog](../../screenshots/S3-audit-grant-form-mobile.png) has dense helper copy and requires scrolling to its action area. Keep required scope and consequence details while simplifying copy and layout.

## Required before S3 can be marked done

1. Render authorized `zur-asset` images in the author preview and student delivery. Assert the browser image loads (`naturalWidth > 0`) and alt text survives the MCP/UI round trip. Align the editor's upload-limit copy with the actual 10 MB limit.
2. Make a real unsaved builder edit, apply a concurrent SDK mutation, and prove local text survives with a usable conflict comparison. Do not use a synthetic session flag as the sole evidence.
3. Correct the real-SDK journey's validation and batch request shapes, require successful tool results, finish exact-revision publication, and capture the published browser state. Exercise MCP-01–MCP-12 with real SDK/browser evidence where the PRD requires it, including the OAuth-only setup limitation.
4. Tighten P43 mobile metadata/actions and shorten redundant grant copy while preserving the security summary, permission consequences, and accessibility.

The same S3 agy conversation (`98adc3c3-da71-42d4-9b08-c3d6905e889d`, Gemini 3.8 Flash High) was given these corrections. Three consecutive continuation runs ended in model-service `RESOURCE_EXHAUSTED` (429), the last before any usable response. The stage remains **in progress**; S4 should start after the S3 gate is independently verified.
