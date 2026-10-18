# Frontend deploy-readiness audit (2026-10-18) - packages/web

Read-only. Method: static grep/read plus `npm run build`, `npm audit --omit=dev`, and a node reproduction of the markdown renderer. The app was NOT run in Chrome, so anything needing a live browser is labelled UNVERIFIED.

## Ranked findings

### 1. HIGH - Stored XSS via markdown link scheme filter bypass (VERIFIED in renderer output)
- `packages/shared/src/markdown.ts:72` `DANGEROUS_PROTOCOLS = /^(javascript:|vbscript:|data:text\/html)/i`, applied to `url.trim()` at :395-401 (`renderInlinesToHtml`) and :89 (`sanitizeHtml`).
- Browsers strip TAB/LF/CR inside a URL and strip leading C0 control chars, so the filter does not see the scheme.
- Repro, run through `renderMarkdownToHtml`:
  - input `[a](java<TAB>script:alert(1))` gives `<a href="java	script:alert(1" rel="noopener noreferrer">`
  - input `[b](<\x01>javascript:alert(2))` gives `<a href="\u0001javascript:alert(2" ...>`
  - `new URL("java\tscript:alert(1)").protocol` is `javascript:` in Node, and `new URL("\x01javascript:...")` too. A click would execute script in the app origin. In-browser click was not run (UNVERIFIED), but the URL-parser behaviour is standard.
- Impact: a course author, or an AI agent via MCP, writes theory markdown. Any learner or admin who clicks the link runs script with access to `localStorage` (the bearer token, see #2). Rendered via `TheoryStepPage.ts:39` into `innerHTML`.
- The lazy `.+?` link regex also truncates at the first `)`, which is cosmetic.
- Fix: replace the blacklist with an allowlist. Strip `[\u0000- ]` from the URL before testing, then accept only `^(https?:|mailto:|/|#)`; otherwise render `<span>`. Apply the same to `sanitizeHtml` and to the image `src` (:467-478, which accepts any external URL; only `javascript:` and `data:text/html` are blocked, so a tracking pixel is possible and `data:` image URLs are allowed).
- Also: `TheoryStepPage.ts:46-52` interpolates `lang` into attributes. It comes from the `[^"]*` capture of already-escaped output, so it is safe today. Fragile, but not exploitable.

### 2. HIGH - Bearer token and user object in localStorage
- `services/auth-client.ts:14,47-48` (`zur_*` TOKEN_KEY and USER_KEY). Every request uses `Authorization: Bearer`.
- Combined with #1 and with no CSP (#3), any XSS gives account takeover (author and admin tokens included).
- Positive: no token in URLs was found; `returnTo` is handled safely (see Verified-OK).
- Smallest safe fix: fix #1 and ship a CSP now. Moving to an HttpOnly SameSite cookie needs server work and is a post-launch item.

### 3. HIGH - No CSP or security headers, and the code would not pass a strict CSP
- `packages/server/src/server.ts` sets only `X-Content-Type-Options: nosniff` on a few download responses (:370, :574, :587, :1509). No CSP, X-Frame-Options/frame-ancestors, HSTS, Referrer-Policy or Permissions-Policy turned up in my grep. (UNVERIFIED: the static-file path and any reverse proxy were not inspected.)
- Blockers for a strict CSP:
  - inline `<script>` first-paint theme in `index.html:~30`;
  - `onclick="..."` attributes in `components/states/UniversalStates.ts:102,122,156,192,195`, `pages/status/SafeDenialPage.ts:25`, and `pages/author/QuizEditorPage.ts`;
  - 249 inline `style="..."` occurrences in templates (grep count), so `style-src 'unsafe-inline'` is unavoidable without refactoring;
  - Google Fonts from fonts.googleapis.com / fonts.gstatic.com.
- Fix: set the headers at the edge. Suggested policy: `default-src 'self'; script-src 'self' 'sha256-<theme script hash>'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com; img-src 'self' blob: data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'`.
- Then replace the 6 `onclick` strings with delegated listeners. Note `UniversalStates` `onRetryAction`, `onAcceptServer` and `onKeepLocal` interpolate caller-supplied strings into `onclick`. Check that every caller passes a constant (UNVERIFIED for all callers).

### 4. MEDIUM - Dependency audit (`npm audit --omit=dev`, repo root)
- 2 high: `@modelcontextprotocol/sdk` 1.12.0-1.30.1 and `@modelcontextprotocol/client`, advisory GHSA-6qxp-vccf-f47h (OAuth client may send credentials to an MCP-chosen authorization server). `npm audit fix` is available. It is server or agent side rather than browser-bundle, but it should be bumped before deploy.

### 5. MEDIUM - Session expiry handling is inconsistent
- `main.ts:136`, `:1103` and `:3161` handle 401 by redirecting to `/sign-in?returnTo=...`. The `s2Request` helper (~:5750) clears the session and navigates away.
- `AuthClient.fetchApi` (`auth-client.ts:89`) clears the session but does not navigate. Callers that catch the error show a generic message.
- Raw `fetch` calls with `Authorization: Bearer ${authClient.getToken()||''}` (main.ts:~985, :~2193, :~5740) send an empty bearer when logged out, and some end in `catch {}` (admin media preview swallows all errors silently, ~main.ts:5755).
- Draft queues keep edits locally (good, `draft-manager.ts`), but I did not confirm that unsaved author edits are preserved across the forced redirect (UNVERIFIED).
- Fix: route all 401s through one handler, and show "Session expired, sign in again" with the draft preserved.

### 6. MEDIUM - Performance
Build: `npm run build` succeeds in 1.7s (gzip sizes):

| Chunk | Raw | Gzip |
|---|---|---|
| index (main) | 445.9 kB | 109.3 kB |
| codemirror-editor | 398.6 kB | 134.3 kB |
| LandingHeroController | 59.9 kB | 21.8 kB |
| AdminPages | 63.5 kB | 14.7 kB |
| CSS (single bundle) | 220.9 kB | 35.3 kB |

- Main chunk is 6267 lines of `main.ts` plus the whole learner flow. CodeMirror is already lazy-loaded (`main.ts:2179,2585`) - good. Admin and author pages are split.
- Vite warns that `AuthorTreeComponent.ts` is both statically and dynamically imported, so the split is ineffective. Make the imports consistent.
- 14 CSS files linked from `index.html` become one 35 kB-gzip bundle that includes all author, admin and learner CSS for public visitors. Splitting per shell is a modest win; unused-rule analysis was NOT run (UNVERIFIED).
- Render-blocking Google Fonts `<link rel=stylesheet>` (`index.html:12-14`) is a third-party dependency, a privacy and CSP concern, and can block first paint. Fix: self-host the woff2 files (the dist output has no @font-face and `public/` has no fonts), or use `font-display:swap` with a `preload`.
- Full re-render: 128 `innerHTML/insertAdjacentHTML` sites in `main.ts`. Pages replace `appEl.innerHTML` on every navigation, so DOM and listener state is rebuilt; no profiling was done (UNVERIFIED cost).
- Listener leaks: `document.addEventListener('keydown', ...)` for modals (main.ts:263,1582,2402,4308,4464,4520) and `document/window` handlers at 2948-2953, 4895, 5032-5033. Some have explicit cleanup (`lessonVideoReadyCleanup` for `message`, `activeAppearanceCleanup`, `activeModalKeydownListener = null`), but 2948/2953 (document click/keydown inside the workspace setup) and the `beforeunload`/`pagehide` pairs showed no removal on route change in my read. Treat as a probable leak: each workspace visit adds another global handler (UNVERIFIED by runtime count).
- Object URLs: lesson media URLs are tracked in `lessonMediaObjectUrls` and revoked on error; the admin preview revokes on dialog close - OK.
- Intervals: only a resend-cooldown timer (`main.ts:4745`, cleared at 0, but it keeps running if the user navigates away before it reaches 0 - minor) and the landing typing timer.

### 7. MEDIUM - Dead or fragile UI and states
- `data-action` sweep: of 30 distinct `data-action` values, only `add-public-test`, `add-hidden-test` (`PythonExerciseEditorPage.ts:203,214`) and `retry-validation` (`CoursePublishPage.ts:198`) have no literal handler match. The first two are probably handled through structural selectors (`PythonExerciseEditorPage.ts:382-414`), and the third is a `<a>` with `data-route-retry` that is handled globally at `main.ts:6205`. Likely OK; real click-testing in Chrome was not done (UNVERIFIED).
- Offline handling: only author/workspace save indicators say "Unsaved edits (offline)" (`main.ts:1851,2496`). No global offline banner, `navigator.onLine` or Retry-After handling.
- Double submit: 38 `disabled = true` sites in `main.ts`, and the global `submit` handler at :5732 exists. Per-form coverage was not enumerated (UNVERIFIED). Complete-step forms in `VideoStepPage.ts`/`TheoryStepPage.ts` use a plain `<form method=POST action="/api/enrollments/.../complete">`, so confirm the global handler intercepts them; otherwise a native POST would land on a JSON endpoint.
- Accessibility: positive signs (dialog `showModal`, `aria-live`, `role=alert`, focus handling at 46 sites). Not tested with a keyboard or screen reader, and contrast was not measured (UNVERIFIED).
- Browser support: uses `<dialog>`, `inert`, and `URL`; modern evergreen only, no browserslist or documented target.

## Verified OK
- `returnTo`: `getSafeReturnDestination` (`router/routes.ts:160`) requires a leading `/`, rejects `//` and `\`; sign-in/up forms re-escape the hidden value (`SignInPage.ts:96`, `SignUpPage.ts:94`); `main.ts:4626` goes through `getPostSignInDestination`. `/join/${opts.token}` inside the returnTo (`AcceptInvitationPage.ts:84`) is not URL-encoded or escaped, but the token is server-issued (low).
- Two duplicated `escapeHtml` helpers (`utils/` and `components/`) both escape `& < > " '`. `safeTemplateData` escapes recursively and whitelists safe URLs. Markdown inline text is escaped before tags are added, so only the URL path (#1) is a bypass.
- Video embeds: the URL is rebuilt from an ID-only regex into fixed `youtube-nocookie.com` / `player.vimeo.com` hosts, so an author cannot supply an arbitrary iframe src. The `message` handler checks both `event.source` and `event.origin` (`main.ts:2142`) and is removed on route change. The iframe has no `sandbox` attribute (hardening opportunity). The Loom host was not reviewed.
- `postMessage` sends to a fixed `frameOrigin`, not `*`.

## Suggested pre-deploy order
1. Fix the markdown URL allowlist (#1) and add a regression test with the tab/control-char payloads.
2. Add edge security headers and CSP (#3), then drop the `onclick` attributes.
3. Bump the MCP SDK (#4).
4. Unify 401 handling (#5).
5. Self-host fonts and fix the AuthorTreeComponent chunking (#6).
