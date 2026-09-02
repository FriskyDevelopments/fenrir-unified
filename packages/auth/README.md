# @frisky/auth

Shared Better Auth wrapper for Frisky **app login** (who is this user?).

- Identity store: Neon `app_auth_*` tables
- Mount: `/api/frisky-auth/*`
- Providers: Google and Microsoft when credentials exist. Apple app-login is off until `APPLE_CLIENT_SECRET` is set (community-gate Apple still uses TEAM_ID/KEY/p8 on the membership plane).

This package does **not** answer community membership. Fenrir Community Gate stays on `fenrir_*` tables and `fenrir_community_session`.

## Apply schema

```bash
psql "$NEON_DATABASE_URL" -f sql/app_auth.sql
```

## Pages Function

See `examples` usage in `apps/fenrir-bridge/functions/api/frisky-auth/[[path]].ts`.
