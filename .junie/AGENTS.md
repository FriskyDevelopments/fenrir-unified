# Project Guidelines

## Project
- Repository: `fenrir-unified`
- Main app: `apps/fenrir-bridge`
- Stack: React 19, TypeScript, Vite, Cloudflare Pages, Pages Functions, D1
- Production domains: `https://myfenrir.com`, `https://www.myfenrir.com`, `https://auth.myfenrir.com`

## Working Directory
Most app work should happen from:

```bash
cd apps/fenrir-bridge
```

## Commands
- Install dependencies: `npm install`
- Start frontend dev server: `npm run dev`
- Build: `npm run build`
- Typecheck: `npm run typecheck`
- Auth redirect checks: `npm run test:auth-redirect`
- Production smoke check: `npm run verify:prod`

Run `npm run build` before deploy-oriented changes.

## Auth Redirect Notes
Live identity is `fenrir-auth-worker` on `https://myfenrir.com/auth/*`.

- Login start URLs: `/auth/google`, `/auth/microsoft`, `/auth/apple`.
- Provider callbacks (register these in OAuth consoles): `/auth/{provider}/callback`.
- Do not register the SPA path `/auth/callback`. The Worker treats the last `/auth/{segment}` as a provider name, so `/auth/callback` returns `{"error":"unknown_provider","provider":"callback"}`.
- `auth.myfenrir.com` and `/api/auth/callback/:provider` are retired broker paths. Keep them out of Google / Microsoft / Apple consoles for Fenrir app login.
- `/api/frisky-auth/callback/*` is parked (PR #3). Do not point consoles there.

Current callback URIs used by the live Worker:

```text
https://myfenrir.com/auth/google/callback
https://myfenrir.com/auth/microsoft/callback
https://myfenrir.com/auth/apple/callback
```

Start URLs:

```text
https://myfenrir.com/auth/google
https://myfenrir.com/auth/microsoft
https://myfenrir.com/auth/apple
```

The Worker always emits the **apex** callback, even when the user started on www.
Console walkthrough: `apps/fenrir-bridge/docs/OAUTH_CONSOLE_REDIRECTS.md`.

## Deployment Config

- Public Cloudflare Pages vars live in `apps/fenrir-bridge/wrangler.jsonc`.
- Secret values must stay in Cloudflare Pages/Workers environment variables and must not be committed.
- `PUBLIC_SITE_URL` should point at the canonical app origin.
- Fenrir app login does not use `PUBLIC_AUTH_URL=https://auth.myfenrir.com` anymore.
- `ALLOWED_REDIRECT_URIS` should include every post-auth app origin that can receive users.

## Safety
- Keep changes scoped to `apps/fenrir-bridge` unless the task clearly touches repo tooling.
- Do not revert unrelated uncommitted changes.
- Prefer existing helpers in `functions/_lib` and `src/services`.
