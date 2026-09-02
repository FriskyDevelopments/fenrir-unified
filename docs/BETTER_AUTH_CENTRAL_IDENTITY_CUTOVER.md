# Better Auth central identity cutover

Status: **active in production** at `https://auth.myfenrir.com/api/auth`.
Version: 1.1 (30 amendments applied 2026-09-02)
Owner: platform / identity
Non-goals: workspace RBAC, billing, Community Gate membership, KYC.

## Product boundary

- Better Auth owns sign-in, sessions, provider callbacks, JWT/JWKS, and the
  OAuth 2.1 / OpenID Connect provider surface.
- MyFenrir keeps its existing D1 workspace and role records. A successful
  Better Auth session mints the transitional `fenrir_session` cookie
  (`HttpOnly; Secure; SameSite=Lax`; host-only on the MyFenrir app domain)
  so current authorization rules continue to apply.
- Community Gate keeps separate membership, review, and verification
  rules. Social identity starts at the central Better Auth page; Gate never
  treats "has a Better Auth session" as "is an approved member".
- LibreChat on Power One consumes Better Auth as a confidential OIDC client
  with fixed redirect URI and PKCE S256. Social registration remains closed;
  existing users are matched by normalized lowercase email. Plus-aliases are
  not auto-merged.
- Authentik is not a supported provider, is not a fallback, and must remain
  offline. Do not re-enable it.

Supported social providers (buttons render only if client id and secret
exist at runtime): Google, Microsoft.

OIDC scopes in contract: `openid email profile`.
Issuer (immutable): `https://auth.myfenrir.com/api/auth`.

## Live endpoints

- Login page: `https://auth.myfenrir.com/sign-in`
- Better Auth handler: `https://auth.myfenrir.com/api/auth/*`
- OIDC discovery: `https://auth.myfenrir.com/api/auth/.well-known/openid-configuration`
- JWKS: `https://auth.myfenrir.com/api/auth/jwks`
- Authorization: `https://auth.myfenrir.com/api/auth/oauth2/authorize`
- Token: `https://auth.myfenrir.com/api/auth/oauth2/token`

Redirect URIs are an allowlist. Unknown callbacks are rejected.

## Activation controls

| Variable | Prod after cutover | Notes |
| --- | --- | --- |
| `BETTER_AUTH_ENABLED` | `true` | Central handler + login UI |
| `BETTER_AUTH_MIGRATION_ENABLED` | `false` | Must stay false after migrations / one-shot client bootstrap |
| `BETTER_AUTH_MIGRATION_TOKEN` | unset in app env after bootstrap | Secret manager only. Never in source or logs. Rotate after use. |

Provider buttons are advertised only when both client ID and client secret
are present at runtime.

## Database

The additive migration created namespaced `app_auth_*` tables in the existing
Neon database. It does not rename, delete, or rewrite the existing user,
workspace, Community Gate, Supabase, or billing tables. Retention of auth
rows follows the identity retention policy; rollback does not drop them.

## Verification contract

Before calling the cutover complete, verify all of the following:

1. Typecheck, unit tests, and production build pass.
2. `/api/auth/providers` reports `engine: better-auth` and only configured
   providers.
3. OIDC discovery reports issuer `https://auth.myfenrir.com/api/auth`.
4. Provider start uses PKCE S256 and returns to
   `https://auth.myfenrir.com/api/auth/callback/<provider>`.
5. LibreChat redirects to Better Auth with its exact callback and PKCE.
6. A human completes one provider sign-in and returns with a session.
7. After that sign-in, `fenrir_session` is set with the cookie flags above.
8. Token endpoint rejects missing/invalid PKCE with 400; codes are one-time.
9. The migration/bootstrap gate returns 404.
10. Staging repeats discovery + JWKS + one test provider before prod sign-off.
11. Health of the handler is green; JWKS cache headers allow key overlap
    during rotation.

## Rollback

Set `BETTER_AUTH_ENABLED=false` and deploy the same build. Target: service
restored on the direct Google/Microsoft rail within the agreed RTO.
The direct Google/Microsoft path remains available as a temporary rollback
rail. Do not turn Authentik back on.

Database changes are additive and do not need to be deleted during rollback.
Leave `app_auth_*` tables in place.

Break-glass: platform admin uses the documented offline recovery path.
Authentik is not that path.

## Operations

- Rate-limit sign-in, authorize, and token.
- Log no bearer tokens, no auth codes, no migration token.
- Alert on handler 5xx, discovery/JWKS downtime, and sign-in success-rate drop.
- Assume small JWT clock skew between issuer and confidential clients.
- Identity data is processed under LFPDPPP for authentication only.

## Changelog

- 1.1 (2026-09-02): thirty amendments — cookie flags, PKCE MUST, env table,
  verification negatives, rollback RTO, privacy/ops, Authentik non-fallback.
- 1.0: initial production cutover note.
