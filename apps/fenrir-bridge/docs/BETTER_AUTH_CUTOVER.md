# Better Auth central identity cutover

Status: **active in production** at `https://auth.myfenrir.com/api/auth`.

## Product boundary

- Better Auth owns sign-in, sessions, provider callbacks, JWT/JWKS, and the
  OAuth 2.1 / OpenID Connect provider surface.
- MyFenrir keeps its existing D1 workspace and role records. A successful
  Better Auth session mints the transitional `fenrir_session` cookie so current
  authorization rules continue to apply.
- Community Gate keeps its separate membership, review, and verification
  rules, but social identity now starts at the central Better Auth page.
- LibreChat on Power One consumes Better Auth as a confidential OIDC client.
  Social registration remains closed; existing users are matched by email.
- Authentik is not a supported provider and must remain offline.

## Live endpoints

- Login page: `https://auth.myfenrir.com/sign-in`
- Better Auth handler: `https://auth.myfenrir.com/api/auth/*`
- OIDC discovery: `https://auth.myfenrir.com/api/auth/.well-known/openid-configuration`
- JWKS: `https://auth.myfenrir.com/api/auth/jwks`
- Authorization: `https://auth.myfenrir.com/api/auth/oauth2/authorize`
- Token: `https://auth.myfenrir.com/api/auth/oauth2/token`

## Activation controls

- `BETTER_AUTH_ENABLED=true` activates the central handler and login UI.
- `BETTER_AUTH_MIGRATION_ENABLED` must remain `false` after migrations or
  one-shot client bootstrap operations.
- `BETTER_AUTH_MIGRATION_TOKEN` is never stored in source or logs.
- Provider buttons are advertised only when both client ID and client secret
  are present at runtime.

## Database

The additive migration created namespaced `app_auth_*` tables in the existing
Neon database. It does not rename, delete, or rewrite the existing user,
workspace, Community Gate, Supabase, or billing tables.

## Verification contract

Before calling the cutover complete, verify all of the following:

1. Typecheck, unit tests, and production build pass.
2. `/api/auth/providers` reports `engine: better-auth` and only configured
   providers.
3. OIDC discovery reports issuer `https://auth.myfenrir.com/api/auth`.
4. Provider start uses PKCE and returns to
   `https://auth.myfenrir.com/api/auth/callback/<provider>`.
5. LibreChat redirects to Better Auth with its exact callback and PKCE.
6. A human completes one provider sign-in and returns with a session.
7. The migration/bootstrap gate returns 404.

## Rollback

Set `BETTER_AUTH_ENABLED=false` and deploy the same build. The direct
Google/Microsoft path remains available as a temporary rollback rail. Do not
turn Authentik back on. Database changes are additive and do not need to be
deleted during rollback.
