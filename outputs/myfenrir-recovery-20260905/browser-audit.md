# MyFenrir public and recovery audit — 2026-09-06 UTC

Public live checks:
- myfenrir.com and www.myfenrir.com return 200 with matching final deployment assets index-B8dV-RnJ.js and index-CUviGQ7V.css.
- Public landing, login, and Community Bridge login load without page exceptions or failed assets in a fresh headless Chrome context.
- Google, Apple, and Azure Supabase authorize endpoints return 302 to their real provider authorization pages.
- Human verification slider completed through normal keyboard input: verification service POST 200, MyFenrir grant POST 200, verification cookie set for .myfenrir.com, all provider buttons enabled.
- Clicking Google after verification reaches Google account identifier sign-in page without errors. No account credentials were entered. Authenticated OAuth callback was not tested live.
- Fresh Community Bridge /dashboard redirects to its own sign-in page as expected.

Local production bundle with synthetic browser request fixtures: 6/6 pass.
1. Session service 503 shows recovery; retry loads dashboard.
2. Hanging session request shows recovery after approximately 12.5 seconds.
3. Workspace service 503 shows recovery; retry loads dashboard.
4. Workspace 401 returns sign-in.
5. Logout 503 shows explicit failure and preserves recovery; successful retry reaches sign-in.
6. Authenticated dashboard loads, /links navigation and reload succeed, logout and return remain signed out.

Actual patched logout handler was imported and its Set-Cookie headers applied in an isolated browser origin. Both the host-only www.myfenrir.com cookie and parent-domain .myfenrir.com cookie were removed (2 before, 0 after).

Runner: Playwright with Google Chrome, fresh headless contexts. No screenshots, existing browser profiles, real sessions, email, or payments used.
Scripts: audit.cjs, verify.cjs, recovery.cjs, cookie-regression.mjs in this directory.

## Final production validation

Deployment reported by root: https://f8b485a1.fenrir-bridge.pages.dev.
Both production domains independently confirmed to serve final index-B8dV-RnJ.js.
Fresh browser verified www.myfenrir.com/login → completed human slider → /api/verification/grant 200 → enabled social buttons → Google identifier sign-in page after deployment. No account credentials entered.
Actual production unauthenticated POST /api/auth/logout returned 200 with two fenrir_session expiration headers: host-only and Domain=myfenrir.com. This confirms the logout cookie-scope repair is live.
Final isolated production-bundle workspace retry regression also confirmed that the stale error notice is removed after successful recovery.

## Worker route return-path correction

Independent comparison identified the live legacy auth Worker intercepting /auth/callback and /auth/v1/callback with 404 unknown_provider while the exact Pages deployment returned HTML 200. Root corrected the Cloudflare route ownership.
After the correction, fresh browser tests on both apex and www loaded /auth/callback?error=access_denied with 200, removed original callback parameters, reached /main with only auth_error, and displayed recoverable sign-in with a provider-denied explanation. No page errors, failed requests, or HTTP resource errors occurred.

Additional route blocker reported to root: empty unsigned POST /api/telegram/link/confirm returns Worker 404 on both custom domains while the exact Pages deployment correctly returns 401 invalid_signature. No codes, identity data, signatures, or account sessions were supplied. This is the canonical bot confirmation writer in source and requires route ownership correction before claiming Telegram link confirmation operational.

GET /api/telegram/link/start returns unauthenticated 302 on both production domains; GET /api/telegram/link returns expected 401. /api/telegram/link/status is not implemented or referenced in canonical client source and returns 404 on both production and Pages.
