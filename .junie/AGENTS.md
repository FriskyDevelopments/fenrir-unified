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
- The SPA callback route is `/auth/callback`.
- The direct provider callback routes are `/api/auth/callback/google`, `/api/auth/callback/microsoft`, and `/api/auth/callback/apple`.
- Every OAuth dashboard (Supabase provider config, Google/Microsoft/Apple consoles) must register redirect URIs exactly; if a provider reports an invalid redirect URI, add the exact URI it printed to that provider's allowed list.

Current callback candidates used by this app:

```text
https://myfenrir.com/auth/callback
https://www.myfenrir.com/auth/callback
https://auth.myfenrir.com/api/auth/callback/google
https://auth.myfenrir.com/api/auth/callback/microsoft
https://auth.myfenrir.com/api/auth/callback/apple
```

Do not confuse the SPA callback route (`/auth/callback`) with direct provider callbacks (`/api/auth/callback/:provider`).

## Deployment Config
- Public Cloudflare Pages vars live in `apps/fenrir-bridge/wrangler.jsonc`.
- Secret values must stay in Cloudflare Pages/Workers environment variables and must not be committed.
- `PUBLIC_SITE_URL` should point at the canonical app origin.
- `PUBLIC_AUTH_URL` should point at `https://auth.myfenrir.com`.
- `ALLOWED_REDIRECT_URIS` should include every post-auth app origin that can receive users.

## Safety
- Keep changes scoped to `apps/fenrir-bridge` unless the task clearly touches repo tooling.
- Do not revert unrelated uncommitted changes.
- Prefer existing helpers in `functions/_lib` and `src/services`.
