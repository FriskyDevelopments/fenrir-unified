# MyFenrir Auth Recon — WorkOS → Supabase SSO (preview)

_Repo: `~/fenrir-unified` · App: `apps/fenrir-bridge` (Cloudflare Pages, project `fenrir-bridge`) · Recon date: 2026-08-06_

## TL;DR

The **current branch working tree already implements Supabase SSO** as the MyFenrir login broker, in the correct provider order **Apple → Google → Microsoft**. `main` is the branch that still redirects to WorkOS — that is the "keeps reverting to WorkOS" regression. This task packages the already-restored Supabase flow onto a clean preview branch (`feat/supabase-sso`) and deploys a Cloudflare Pages **preview** for Francisco to approve.

## Current-state map

### Client login path (`apps/fenrir-bridge/src`)
- **Login UI** — `src/App.tsx` renders the provider buttons from the literal array `(["apple", "google", "microsoft"] as AuthProvider[])` (≈ line 3311) via `AuthProviderButton`. Order is already Apple → Google → Microsoft. The terminal flavor text also reads `providers: apple · google · microsoft`.
- **Auth gateway** — `src/services/authGateway.ts` exposes `friskyClientAuthEngine.signInWithProvider(p) → authService.login(p)`.
- **Broker selection** — `src/services/api.ts` `authService.login()`:
  - If `isSupabaseAuthConfigured()` → `signInWithSupabase(provider)` (Supabase `signInWithOAuth`). **This is the active path.**
  - Else → falls back to direct per-provider stack `${VITE_DIRECT_AUTH_ORIGIN}/api/auth/login/${provider}`.
  - WorkOS is deliberately **not** in this path (comment cites regression `1621d6a`).
- **Supabase client** — `src/services/supabaseAuth.ts`:
  - `signInWithSupabase()` → `supabase.auth.signInWithOAuth({ provider, options.redirectTo })`. Microsoft maps to Supabase provider `azure`.
  - Public Supabase config is baked in as defaults so a build without `.env` still uses Supabase (avoids the silent fallback that shipped the WorkOS regression): `VITE_SUPABASE_URL=https://yqevglppbhuoxxfsfnih.supabase.co`, `VITE_SUPABASE_ANON_KEY=sb_publishable_…` (public by design).
  - Redirect target defaults to `https://www.myfenrir.com/auth/callback` (`VITE_AUTH_REDIRECT_ORIGIN` + `VITE_AUTH_REDIRECT_PATH`).
  - `completeSupabaseSession()` → `exchangeCodeForSession` then POSTs the access token to `/api/auth/supabase-session` to mint the Fenrir cookie.
- **`.env` (build-time, app dir)** — sets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AUTH_REDIRECT_ORIGIN`, `VITE_AUTH_REDIRECT_PATH`, `VITE_FENRIR_MANAGED_URL=/main`. All public/non-secret.

### Server / edge (Cloudflare Pages Functions, `apps/fenrir-bridge/functions`)
- **Supabase session exchange** — `functions/api/auth/supabase-session.ts` + `functions/_lib/supabase.ts` verify the Supabase access token and set the session cookie (identity source of truth = Supabase `auth.users`).
- **Direct-OAuth fallback stack** — `functions/api/auth/login/[provider].ts` and `functions/api/auth/callback/[provider].ts` use `functions/_lib/oauth.ts`. This is the per-provider (Google/Microsoft/Apple) fallback, gated by `isDirectOAuthAvailable()` — **not** WorkOS.
- **Community Gate OAuth** — `functions/api/community-auth/**` + `functions/_lib/community-oauth.ts` is a separate Neon-backed system; it already rejects `workos` as a provider (see `functions/__tests__/community-oauth.test.ts`).

### Where WorkOS still lives (and whether it matters for MyFenrir login)
- `apps/fenrir-bridge/workers/fenrir-mcp-beta.js` + `wrangler.fenrir-mcp-beta.toml` — the **Fenrir MCP beta worker** uses WorkOS as its OAuth resource server. This is a *separate deployable* from the MyFenrir Pages login and is **out of scope** for this cutover. Left untouched.
- Root `.env` — still carries `WORKOS_*` keys; consumed by the MCP beta worker, not by the Pages login build.
- Tests + docs reference WorkOS only to assert it is rejected / to document history.

### `main` vs current branch (the regression)
- `git show main:…/src/services/api.ts` → `authService.login` does `window.location.assign(".../api/auth/login/workos…")` and the session type includes `"workos"`. **`main` = WorkOS login.**
- `HEAD` (branch `rescue/myfenrir-login-friskydev`, commit `c4a92b8`) already uses `signInWithSupabase`. The uncommitted working-tree changes go further and **remove WorkOS entirely** from `functions/_lib/oauth.ts` (provider union, `isDirectOAuthAvailable`, `getAuthorizationUrl`, `exchangeWorkOSCode`), `functions/_lib/auth.ts`, `functions/_lib/billing-env.ts` (`WORKOS_CLIENT_ID/API_KEY` dropped), and the `authProvider` union in `api.ts`.

## What the preview needs to actually complete a login
The build/preview will render the Supabase login and redirect correctly, but a **full OAuth round-trip** depends on Supabase-side provider config (not in this repo):
1. **Supabase Auth providers** enabled in project `yqevglppbhuoxxfsfnih`: Apple, Google, Azure(Microsoft) — each with its OAuth client ID/secret.
2. **Redirect URLs allow-listed** in Supabase Auth settings must include the preview origin's `/auth/callback` (e.g. `https://feat-supabase-sso.fenrir-bridge.pages.dev/auth/callback`) in addition to prod `https://www.myfenrir.com/auth/callback`. Supabase's own callback `https://yqevglppbhuoxxfsfnih.supabase.co/auth/v1/callback` must be registered at each provider (Apple/Google/Azure).
3. **Provider consoles**: Google Cloud OAuth client, Apple Services ID + key, Azure app registration — each must list the Supabase callback as an authorized redirect URI.

## Safety posture
- Preview branch `feat/supabase-sso` + Pages preview branch `feat-supabase-sso` only. **No production domain / production login is touched.**
- Deploy: `env -u CLOUDFLARE_API_TOKEN npx wrangler@4 pages deploy dist --project-name=fenrir-bridge --branch=feat-supabase-sso --commit-dirty=true` (run on Francisco's Mac where wrangler is OAuth-authed; sandbox `node_modules` is macOS-native so build/deploy happen there).
- Secrets: none required for the preview build — Supabase URL/anon key are public and already present. Provider secrets live in Supabase, not the bundle.
