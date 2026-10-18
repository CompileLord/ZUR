# ZUR Backend Security Audit (read-only), 2026-10-18

Branch: redesign/2026-10-18. Scope: packages/server, packages/shared, packages/worker (plus web only where it affects server-side findings).
Method: static reading of source, grep, one `npm audit --omit=dev`, one node one-liner against shared/src/markdown.ts. No servers were started; nothing was exploited against a running instance. "VERIFIED-READ" = confirmed by reading code. "VERIFIED-RUN" = confirmed by executing a command. "UNVERIFIED" = inferred.

Line numbers refer to packages/server/src unless prefixed.

## Findings

### F1. Stored XSS via markdown link scheme blacklist bypass (HIGH) VERIFIED-RUN
- packages/shared/src/markdown.ts:72 `DANGEROUS_PROTOCOLS = /^(javascript:|vbscript:|data:text\/html)/i`, used at :399 in `renderInlinesToHtml` (`<a href="${url}">`, url only HTML-escaped, then regex tested on `url.trim()`).
- Browsers strip tab/newline inside URLs and leading C0 control chars, so the blacklist misses them. Run:
  `renderMarkdownToHtml('[x](java<TAB>script:alert(1))')` returned `<a href="java\tscript:alert(1" ...>`; `renderInlinesToHtml('[x](\u0001javascript:alert(1))')` returned `<a href="javascript:alert(1" ...>`.
- Server never sanitises on write: grep of packages/server/src finds no sanitizeMarkdown/sanitizeHtml use. The learner page web/src/pages/learning/TheoryStepPage.ts:39 and QuizStepPage.ts:107,143 render author text with these functions.
- Exploit: any author (self-service capability) publishes a theory step or quiz option with such a link; a learner or admin clicking it runs JS in the app origin.
- Impact is amplified by F2.
- Fix: allowlist schemes (`^(https?:|mailto:|/|#)` after stripping `[\u0000- ]`), applied in the render path; add DOMPurify in the web layer for `innerHTML`.

### F2. Session token kept in localStorage in addition to HttpOnly cookie (HIGH) VERIFIED-READ
- web/src/services/auth-client.ts:14,47 `localStorage.getItem/setItem(TOKEN_KEY)`; the server also returns `token` in the sign-in JSON body (:250-262) and accepts `Authorization: Bearer` (:134-136).
- HttpOnly cookie protection is nullified: any XSS (F1) reads the token and gets a 30-day session. Combined with F1 this is author->learner and author->admin session theft. Admin routes need re-entry of the password for mutations (good), but reads of PII (users, audit, privacy exports) do not.
- Fix: cookie-only for the browser (do not return the token in the body, or return it only to non-browser clients); keep Bearer for MCP/CLI.

### F3. No security headers anywhere (HIGH for production) VERIFIED-READ
- grep for Content-Security-Policy, X-Frame-Options, Strict-Transport-Security, Referrer-Policy in packages/server/src and packages/web/index.html: no matches. Only `X-Content-Type-Options: nosniff` on asset delivery (:1500s).
- Consequences: no CSP to contain F1; clickjacking possible; no HSTS. Static hosting of the web bundle is not in this repo (UNVERIFIED how it is deployed), so these may be set by a reverse proxy; nothing in repo documents it.
- Fix: set CSP (`default-src 'self'; frame-src youtube-nocookie.com player.vimeo.com www.loom.com; object-src 'none'`), frame-ancestors, HSTS, Referrer-Policy at the edge or in sendJson.

### F4. Cookie lacks `Secure`; SameSite=Lax only; no CSRF token; any Content-Type accepted (MEDIUM) VERIFIED-READ
- :250-262 `zur_session=...; Path=/; HttpOnly; SameSite=Lax; Max-Age=...` has no `Secure`, no `__Host-` prefix.
- parseJsonBody (:150-170) does not check Content-Type, so a cross-site `text/plain` form POST is parsed as JSON. Lax blocks cross-site POST cookies in modern browsers, so exploitability is limited to same-site contexts (sibling subdomains) or older browsers.
- Fix: add `Secure` when not on localhost, use `__Host-` name, reject non-`application/json` bodies on mutating routes.

### F5. CORS `Access-Control-Allow-Origin: *` on every REST response (MEDIUM) VERIFIED-READ
- :174-181, :200-205. Wildcard origin is not credentialed so cookies are not exposed cross-origin, but a Bearer token from any origin script is accepted, and any site can read unauthenticated responses (catalog etc.). The MCP path implements a proper Origin/Host allowlist (mcp/transport.ts:60-95); REST does not.
- Fix: reflect only configured app origin(s).

### F6. Request body limit applied after buffering; unauthenticated 20 MB bodies parsed before rate limits (MEDIUM) VERIFIED-READ
- :150-170: `data += chunk; if (data.length > 20MB) reject(...)` but never `req.destroy()` / stops reading, so the stream keeps accumulating into `data` until the client stops. 20 MB is also very large for JSON (needed only for base64 images at :1359).
- Sign-up (:217-227), sign-in (:250), resend, forgot-password all call `parseJsonBody` BEFORE `consumeRequestRateLimit` (sign-up, resend, forgot). Unauthenticated memory pressure.
- No `server.headersTimeout/requestTimeout/maxHeaderSize` customisation found (grep) beyond Node defaults.
- Fix: per-route limits (e.g. 64 KB default, 14 MB for the asset route), destroy request on overflow, limit before parse.

### F7. Rate limiting keyed on `socket.remoteAddress` (MEDIUM) VERIFIED-READ
- :219, :239, :255, identity-service.ts:259-261. Behind any reverse proxy every client shares one IP: `sign-in-ip` limit of 60/15min then locks out all users; per-IP signup limit 10/h locks out everyone. There is no trusted X-Forwarded-For handling (grep `x-forwarded` no matches).
- Fix: configurable trusted-proxy header parsing.

### F8. Sign-in lockout enables targeted account DoS (MEDIUM) VERIFIED-READ
- identity-service.ts:253-262: `consumeRequestRateLimit('sign-in-email', email, 10, 15min)` is consumed on every attempt, successful or not, by anyone who knows the email. 10 requests per 15 min locks a victim out indefinitely. In addition an in-memory map (`checkRateLimit`, 5 attempts per email+IP) does not survive restart nor share across processes.
- Fix: count only failures per (email, IP) pair; use CAPTCHA/backoff for the global key.

### F9. Account enumeration at sign-up (LOW) VERIFIED-READ
- identity-service.ts signUp: `ConflictError('An account with this email already exists.')` (409). Forgot-password and resend are generic (good). Sign-in error is generic (good), but password hashing time differs (user not found skips scrypt -> timing oracle, :267-269 short-circuits `!user ||`).
- Fix: generic sign-up response + email; dummy hash verify on unknown user.

### F10. Password policy and hashing (LOW) VERIFIED-READ
- password-service.ts: scrypt N=16384, r=8, p=1, 64-byte key, 16-byte random salt, timingSafeEqual. Meets minimum but below current OWASP guidance (N=2^17). Only a minimum of 8 chars, no max length (scrypt cost is not length dependent but a 20 MB password body is accepted: hashing cost is bounded, memory not).
- Legacy unsalted SHA-256 verification is accepted in production code path (password-service.ts:28-34, "seed fixtures"). Any stored 64-hex hash is verifiable with plain SHA-256. seed.ts:6-8 creates such hashes. No upgrade-on-login path found. If seed data ever reaches a production DB these accounts are trivially crackable.
- Fix: delete legacy branch outside tests; re-hash on login; raise N.

### F11. Sessions: sign-in does not require verified email; password change does not revoke other sessions; no rotation (MEDIUM) VERIFIED-READ
- signIn (identity-service.ts:250-300) never checks `email_verified`. Email-bound features gate it elsewhere (course-service.ts:549, MCP token validation requires `email_verified`).
- changePassword (identity-service.ts ~395-420) updates the hash but does NOT delete other sessions (resetPassword does). Also no rate limit on `current password` guesses via change-password (:351-358), so a stolen session can brute-force the current password to take over the account permanently.
- Sessions: fixed 30-day expiry, no sliding window, no idle timeout, no rotation, sessions rows are never pruned (UNVERIFIED cleanup job).
- Fix: revoke other sessions on change; rate limit; require re-auth for sensitive actions.

### F12. Account deletion and data export require only a session (MEDIUM) VERIFIED-READ
- :371-391 (`/api/settings/privacy/delete`, `/export`): no password re-authentication, whereas admin actions do call `verifyCurrentPassword`. A hijacked session (F2) can trigger irreversible deletion and obtain a full PII export (export download at :369 is user-scoped via `getPrivacyExport(user.id, id)`, VERIFIED-READ, so no IDOR).
- Deletion workflow itself: sole-owner course block and tombstone registry (reapply-deletions.ts, index.ts:10-11 requires `DELETION_REGISTRY_PATH` in production) look sound.
- Fix: require current password.

### F13. Dependency risk: 2 high severity in production deps (MEDIUM) VERIFIED-RUN
`npm audit --omit=dev` reported:
- `@modelcontextprotocol/sdk` 1.12.0 - 1.30.1, high, GHSA-6qxp-vccf-f47h (OAuth *client* may send credentials to attacker-chosen authorization server). Fix available via `npm audit fix`.
- `@modelcontextprotocol/client` 2.0.0 - 2.1.0, same advisory.
- Impact for ZUR: the advisory concerns the OAuth client; ZUR uses the server side (mcp/transport.ts). Likely not exploitable, but update anyway. Rest of tree clean.

### F14. Code execution sandbox (positive, with two Medium/Low gaps) VERIFIED-READ
worker/src/runner.ts:84-99 podman args: `--network=none --read-only --cap-drop=all --security-opt=no-new-privileges --pids-limit=16 --memory --cpus=1 --tmpfs /tmp size 16m --user=65534:65534`, script mounted `:ro,Z`, image pinned by digest `--pull=never`, `prlimit --cpu --as --fsize --nproc`, `python3 -I -s -B -E`, clean env, wall timer with `podman kill --cidfile`, 64 KiB output cap with kill, sandbox dir removed in `finally`, source and stdin 64 KiB caps (shared/comparator.ts:53-80), queue cap 200, per-user active job cap, kill switch, job lease. Good.
Gaps:
- (MEDIUM, UNVERIFIED runtime) runner.ts:245-248 `child.stdin.write(stdin)` with no `child.stdin.on('error')`. If the container exits before the stdin is consumed (EPIPE), an unhandled stream 'error' event is an uncaught exception; worker/src/daemon.ts has no `uncaughtException` handler, so a learner could crash the worker with `run_custom` of 64 KiB stdin and a program that exits immediately. Reproduction not attempted. Fix: attach a no-op error handler to `child.stdin`.
- (LOW) No `--security-opt seccomp` customisation, no `--ulimit nofile`, no `--userns=auto`; relies on podman defaults. `:Z` relabels a host tmp file (harmless).
- (LOW) :1596-1740 `/api/author/steps/:id/check-reference` runs `runPython` directly in the API process (concurrency 2/author, 5 global), so podman is required on the web host and sandbox failures share the API process; ownership check done in exerciseAuthoringService.getAuthorExercise (VERIFIED-READ).
- The worker imports server modules and the DB directly; the daemon is not itself sandboxed (expected).

### F15. Production cannot start on current code (deploy blocker, not a vulnerability) VERIFIED-READ
- db/database.ts:9 throws when `NODE_ENV === 'production'` ("This build supports SQLite file paths only"). index.ts, worker/daemon.ts both call `getDatabase`. Any production deploy either fails or must run with NODE_ENV != production, which silently switches email to the `mock` provider (email-delivery-service.ts:40) and drops the DELETION_REGISTRY_PATH requirement (index.ts:11). Risk: operators work around by not setting NODE_ENV and then password reset/verification emails are never sent while the service looks healthy.

### F16. Secrets and demo credentials (LOW/MEDIUM) VERIFIED-READ
- `.env` is git-ignored; `git ls-files` shows only `.env.example`; no committed keys or sqlite files. `.env.example` contains `SESSION_SECRET=0123...` (a fixed dummy). grep shows no code reads SESSION_SECRET (sessions are random 32-byte tokens stored hashed), so it is dead config, but a copied example would suggest a known secret.
- packages/server/src/db/create-demo-users.ts:11-12 hard-codes `student@zur.local / StudentPass123!` and `author@zur.local / AuthorPass123!` with email_verified=1 and an author capability. It is an opt-in script (`npm run db:demo-users`), with no NODE_ENV guard (getDatabase blocks production today, which is the only protection). seed.ts is similar (SHA-256 hashes).
- Fix: refuse to run unless `NODE_ENV !== 'production'`; remove dead SESSION_SECRET.

### F17. Authorization review (mostly positive) VERIFIED-READ for each route group sampled
Every route in server.ts calls `identityService.authenticateSession(token)` except the intended public ones (health, auth flows, catalog, categories, public course, asset serving with course-access check, invitation preview). Fallthrough returns safe 404.
- Learner resources: drafts (draft-service.ts:42-47 enrollment.user_id check), attempts list/detail/restore (attempt-service.ts:59-66,123,156), execution job status (execution-service.ts:220-250 owner or course owner), enrollment progress/complete/visit/hint (enrollment.user_id checks), quiz (quiz-service.ts:176-198, isPreview requires course owner), student step content (course-service.ts:632-690 strips referenceSolution and hidden tests). No IDOR found.
- Author resources: ownership via `course.owner_id !== userId` in media-service.ts:55-59, course-structure-service.ts:52-56, exercise-authoring-service.ts:64-77, course-autosave, draft-recovery, agent-activity, teacher-roster-service.ts:29-35, enrollment/invitation `checkCourseOwnerOrAdmin`. Course creation requires author capability (course-service.ts:216).
- Admin: `requireAdmin` re-reads capabilities from the DB each call (admin-service.ts:16-21); mutations additionally call `verifyCurrentPassword` with rate limit. `/api/analytics/events` is admin-checked inline (:940-945). Not verified line by line: all ~25 admin routes' bodies (lines 548-588 are minified single lines); the pattern at each was `authenticateSession` + adminService method which begins with `requireAdmin` (spot-checked via grep, not exhaustively).
- Assets: serving (auth-service.ts:127-170) requires `ready` status, course access, and for learners the asset must be referenced in the pinned snapshot; `Cache-Control: private, no-store`, `nosniff`. Good.
- MCP tokens: 256-bit random secret, only SHA-256 hash stored, expiry, revocation, scope narrowing on replace, course restrictions, author must be active and email-verified (mcp-token-service.ts:423-480); Host allowlist + Origin check + concurrency and rate limiter (mcp/transport.ts). Gaps: (LOW) `validateToken` does not rate limit failed token attempts per IP (UNVERIFIED in transport.ts beyond lines read; guessing is infeasible at 256 bits). Legacy path accepts a hash of only the secret portion (:437-446), harmless.
- Quizzes have no attempt throttling (LOW); pass/fail reveals correct answers only after passing.
- Invitation accept: email-bound invitations compare the account email but do not require `email_verified` (invitation-service.ts:238-245). Attacker would still need the secret token, so LOW.

### F18. Injection and path traversal (positive) VERIFIED-READ / VERIFIED-RUN grep
- SQL: grep for template literals inside `prepare/exec`: only fixed fragments are interpolated (`${whereClause}`, `${placeholders}`, `${enrollmentVersionClause}` built from constants with `?` bound parameters) and seed.ts constant timestamps/table names. No user-controlled string reaches SQL text. LIKE wildcards in admin search (`%` / `_`) are unescaped (LOW, no injection).
- Path traversal: asset file names are `${crypto.randomUUID()}.${ext}`; course directory uses `courseId` which is route-regex-restricted `[a-zA-Z0-9_-]+` and must exist as a course row (media-service.ts:55,271-285). Upload-session staging file `${uploadId}.bin` uses an id that must exist in `media_uploads` (:1405). No traversal found.
- SSRF: grep `fetch(|http.request|axios` in server/shared/worker: the only outbound call is Postmark (email-delivery-service.ts:~108) with a constant URL. Video handling (shared/src/video.ts) never fetches; it rebuilds embed URLs from fixed hosts (youtube-nocookie, player.vimeo.com, www.loom.com) using extracted IDs. No SSRF. Note the YouTube/Vimeo regexes are unanchored (a URL like `https://evil/?x=youtu.be/AAAAAAAAAAA` yields a valid embed for that ID) which is harmless since the output host is fixed.
- File upload: type sniffing by signature (PNG/JPEG/WebP), SVG rejected, 10 MB, 25 MP, 10k px caps, then a bounded `magick` decode (media-service.ts:225-242, `spawnSync` argument array, no shell). Upload-session endpoint is token-gated, single use, content-type and checksum bound, and rejects Bearer credentials. Good. JSON asset endpoint buffers base64 up to the 20 MB body cap (F6).

### F19. Email content (LOW) VERIFIED-READ
- Invitation emails escape HTML (email-delivery-service.ts:175-182). Links built from `APP_BASE_URL` env, not the Host header (no host-header poisoning). Verification/reset tokens: random 32 bytes, SHA-256 hashed in DB, verify 7 days, reset 1 hour, single use (deleted), reset revokes all sessions, resend cooldown 60s. Good. Minor: reset and verify token lookup is not rate-limited per token beyond `reset-ip` 20/15min; `verify-email` has no rate limit (infeasible to brute-force 256 bits).

### F20. Logging (LOW) VERIFIED-READ
- Only `console.error` of `err.stack` with requestId at server.ts:2178 plus migration/start logs. No passwords or tokens logged by server code (grep of console.* in server/src). Reset/verify tokens are passed to the email service; in `mock` mode the in-memory mock holds them (non-production). Request log lacks IP/user for audit (audit_events table covers privileged actions).

### F21. Error handling (LOW) VERIFIED-READ
- 500s return a generic message with requestId. `JSON.parse` failures in body return `Error('Invalid JSON payload')` which is not a ZURError and falls into the 500 branch (:2172-2185) logging a stack trace and returning 500 instead of 400 (also "Payload too large"). Noise and log-flood vector, plus uncaught `reject` after the 20 MB case.

## Counts by severity
Critical: 0
High: 3 (F1, F2, F3)
Medium: 7 (F4, F5, F6, F7, F8, F11, F12), plus F13 dependency (Medium) and F14 stdin EPIPE (Medium, unverified) = 9 Medium total
Low: 8 (F9, F10, F14 gaps, F16, F17 residuals, F19, F20, F21)
Informational/deploy blocker: F15

## Ranked top 15
1. F1 Stored XSS through markdown scheme bypass (High, verified by execution)
2. F2 Session token in localStorage (High) - turns F1 into account takeover
3. F3 No CSP / frame / HSTS headers (High)
4. F15 NODE_ENV=production hard-fails; workaround silently disables email (deploy blocker)
5. F12 Account deletion/export without re-auth (Medium)
6. F11 changePassword keeps other sessions and is unthrottled; sign-in does not need verified email (Medium)
7. F14 stdin EPIPE may crash worker (Medium, unverified)
8. F6 Body limit not enforced while streaming; parse before rate limit (Medium)
9. F8 Sign-in lockout DoS keyed by email (Medium)
10. F7 Rate limits keyed on socket IP (Medium)
11. F4 Cookie not Secure, no CSRF defence / content-type check (Medium)
12. F5 CORS wildcard on REST (Medium)
13. F13 MCP SDK high advisories (Medium; likely not reachable)
14. F10 Legacy unsalted SHA-256 password verification and weak-ish scrypt params (Low)
15. F16 Hard-coded demo accounts and dead SESSION_SECRET example (Low)

## Not covered / unverified
- Web hosting layer (reverse proxy, TLS), so F3/F5 may be mitigated outside the repo.
- All ~25 admin route handlers read only at pattern level.
- Runtime behaviour of the sandbox (podman was not executed); no dynamic testing.
- MCP tool handlers in mcp/tools/* were not individually audited for scope enforcement beyond `requiredScope` check in transport.ts.
