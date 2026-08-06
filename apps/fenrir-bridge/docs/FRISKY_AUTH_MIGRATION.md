# MyFenrir → @frisky/auth migration

**Goal:** App login uses Better Auth + Neon (`app_auth_*`). Community gate stays on `fenrir_*` tables and `fenrir_community_session`. Do not conflate the two systems.

## Status

| Piece | State |
|-------|-------|
| Mount point `functions/api/frisky-auth/[[path]].ts` | Scaffolded (503 until enabled) |
| Live login | Still Supabase / direct OAuth under `/api/auth/*` |
| `@frisky/auth` dependency | Not yet installed in this package |

## Cutover checklist

1. Install the package from `~/frisky-ui-kits/packages/auth` (workspace publish or `file:` link).
2. Apply Neon `app_auth_*` tables from `@frisky/auth` docs.
3. Register callbacks:
   - `https://www.myfenrir.com/api/frisky-auth/callback/google`
   - `https://www.myfenrir.com/api/frisky-auth/callback/microsoft`
   - `https://www.myfenrir.com/api/frisky-auth/callback/apple`
4. Set env: `FRISKY_AUTH_ENABLED=1`, Better Auth secrets, provider client IDs/secrets, `NEON_DATABASE_URL`.
5. Point `AuthGate` at `@frisky/auth` login-screen / client helpers.
6. Keep `/api/community-gate/*` and `/api/community-auth/*` untouched.
7. Run `npm run verify:readiness` + BugBug auth walkthrough.

## Rule

Community verification answers “is this user a member of this community?”  
App login answers “who is this user?”  
They compose; they never replace each other.
