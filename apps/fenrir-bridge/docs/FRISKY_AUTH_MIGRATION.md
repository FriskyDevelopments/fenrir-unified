# MyFenrir → @frisky/auth migration

**Goal:** App login uses Better Auth + Neon (`app_auth_*`). Community gate stays on `fenrir_*` tables and `fenrir_community_session`. Do not conflate the two systems.

Authentik is leftover. The Authentik VM was destroyed 2026-08-28. Do not wire Fenrir back to Authentik. `authentik.friskydev.com` is a stale hostname; DNS takedown is a human ops step, not this repo.

## Status

| Piece | State |
|-------|-------|
| `@frisky/auth` | Vendored at `packages/auth` (Better Auth + `app_auth_*` model names) |
| Mount point `functions/api/frisky-auth/[[path]].ts` | Live when `FRISKY_AUTH_ENABLED=1` |
| Client `AuthGate` | Uses Better Auth social sign-in when `/api/auth/providers` reports `engine: "better-auth"` |
| Community gate | Untouched membership plane (`/api/community-gate/*`, `/api/community-auth/*`) |
| Apple | Callbacks documented below; **not claimed live** until Apple env is complete |

## Cutover checklist (human / production)

Do not deploy production from this change set without the env and schema below.

1. Apply Neon `app_auth_*` tables from `packages/auth/sql/app_auth.sql` (also copied to `docs/neon-app-auth-schema.sql`).
2. Register Better Auth callbacks:
   - `https://www.myfenrir.com/api/frisky-auth/callback/google`
   - `https://www.myfenrir.com/api/frisky-auth/callback/microsoft`
   - `https://www.myfenrir.com/api/frisky-auth/callback/apple` (only when enabling Apple)
3. Set Cloudflare Pages secrets/env (no values in git):
   - `FRISKY_AUTH_ENABLED=1`
   - `BETTER_AUTH_SECRET` (or reuse `SESSION_SECRET`)
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   - `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`
   - `NEON_DATABASE_URL`
   - Apple (app login, not live until this is set): `APPLE_CLIENT_ID` + `APPLE_CLIENT_SECRET` (JWT). Marketing may still mention Apple. Community Gate Apple continues to use `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` on the membership plane.
4. Keep `/api/community-gate/*` and `/api/community-auth/*` on the community plane.
5. Take down `authentik.friskydev.com` DNS when ready (not done from this repo).
6. Run `npm run verify:readiness` + BugBug auth walkthrough after deploy.

Until `FRISKY_AUTH_ENABLED=1` is set, `/api/auth/providers` reports `engine: "legacy-direct-oauth"` so existing Google/Microsoft direct OAuth does not go dark mid-cutover. New identity is Better Auth; Authentik is never offered.

## Rule

Community verification answers “is this user a member of this community?”  
App login answers “who is this user?”  
They compose; they never replace each other.
