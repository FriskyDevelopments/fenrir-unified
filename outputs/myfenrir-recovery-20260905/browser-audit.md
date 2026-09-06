# MyFenrir public and recovery audit — 2026-09-06 UTC

Public live checks:
- myfenrir.com and www.myfenrir.com return 200 with matching deployment assets index-C3jZlSfd.js and index-CUviGQ7V.css.
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

Runner: Playwright package /Users/friskypup/.npm/_npx/9833c18b2d85bc59/node_modules/playwright with /Applications/Google Chrome.app/Contents/MacOS/Google Chrome, fresh headless contexts. No screenshots, existing browser profiles, real sessions, email, or payments used.
Scripts: audit.cjs, verify.cjs, recovery.cjs, cookie-regression.mjs in this directory.
