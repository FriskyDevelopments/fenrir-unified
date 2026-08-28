# Authentik OIDC for Community Bridge

Status: **DEAD leftover. Do not deploy. Do not enable.**

The Authentik VM was destroyed 2026-08-28. Fenrir app login is Better Auth
(`@frisky/auth`, Neon `app_auth_*`). Community membership stays on `fenrir_*`
and `fenrir_community_session`. `AUTHENTIK_ENABLED=true` is a no-op.
`authentik.friskydev.com` is a stale hostname; DNS takedown is a human ops step.

The rest of this file is historical and must not be treated as a runbook.

---

Status (historical, do not follow): written against a VM that no longer exists.
`AUTHENTIK_ENABLED=true` is a no-op. This is not a cutover runbook.

## Where the login actually lives

The login that mints rows into `fenrir_community_oauth_identities` is this app —
`apps/fenrir-bridge`, Cloudflare Pages Functions:

| Step | File |
|---|---|
| Start (`/api/community-auth/oauth/:provider`) | `functions/api/community-auth/oauth/[provider].ts` -> `handleCommunityOAuthStart` |
| Authorize URL + PKCE + signed tx cookie | `functions/_lib/oauth.ts` -> `getAuthorizationUrl`, `communityTransactionSetCookie` |
| Callback (`/api/community-auth/oauth/callback/:provider`) | `functions/api/community-auth/oauth/callback/[provider].ts` |
| Code -> verified identity | `functions/_lib/oauth.ts` -> `exchangeCodeForIdentity` |
| Identity -> Neon user, membership, session | `functions/_lib/community-oauth.ts` -> `finalizeCommunityOAuthSignIn` |
| Identity row upsert | `functions/_lib/community-oauth.ts` -> `upsertCommunityOAuthIdentity` |

`neon_auth.*` (Neon Auth / Better Auth) is provisioned but **unused** —
`neon_auth.account` is empty. `apps/community-bridge` is the Supabase-authed
dashboard downstream of this gate, not the login itself.

## What was added

`authentik` is a fourth `OAuthProvider`, reusing the same PKCE + nonce + signed
transaction cookie machinery as the existing three.

- Authorize: `https://authentik.friskydev.com/application/o/authorize/`
- Token: `https://authentik.friskydev.com/application/o/token/`
- Userinfo: `https://authentik.friskydev.com/application/o/userinfo/` (fallback only,
  used when the id_token lacks `email` because a scope mapping is missing)
- JWKS / issuer: per-application, derived from `AUTHENTIK_ISSUER`

The `id_token` is verified exactly like Google/Microsoft/Apple: RS256, JWKS lookup by
`kid`, issuer pinned to **this application's** issuer, audience = client id, nonce
matched against the transaction, `exp` checked.

Identity mapping: `sub` -> `fenrir_community_oauth_identities.provider_subject` with
`provider = 'authentik'`. The upsert conflict key is `(provider, provider_subject)`,
so the 3 existing rows (google x1, microsoft x2) are untouched — an Authentik login
creates a *new* row, it never overwrites one.

## Environment variables

| Var | Example | Notes |
|---|---|---|
| `AUTHENTIK_ENABLED` | `true` | Hard kill switch. Must be exactly `true`. |
| `AUTHENTIK_ISSUER` | `https://authentik.friskydev.com/application/o/community-bridge/` | Per-application. Trailing slash optional. |
| `AUTHENTIK_CLIENT_ID` | — | From the Authentik OAuth2/OIDC provider. |
| `AUTHENTIK_CLIENT_SECRET` | — | `wrangler pages secret put`. Never in wrangler.jsonc. |

Redirect URI to register in Authentik:
`https://www.myfenrir.com/api/community-auth/oauth/callback/authentik`

## Two gates, both closed by default

1. **Environment** — `isDirectOAuthAvailable("authentik", env)` returns false unless
   the flag is `true` AND all three credentials are set AND the issuer parses.
   Credentials alone are deliberately not enough.
2. **Per community** — `fenrir_gate_communities.enabled_auth_providers` must contain
   `authentik`. Today it is `['google','apple','microsoft']`, so no community sees the
   button even if the environment were fully configured.

Turning it off is one variable: set `AUTHENTIK_ENABLED=false` and the provider stops
existing — no secret unbinding, no redeploy of the direct providers.

## Rollout order (do not skip)

1. Deploy the branch to a **preview** with the flag on, and enable `authentik` on a
   throwaway community slug only.
2. Sign in end to end through Authentik. Confirm a new row appears with
   `provider='authentik'` and that the 3 pre-existing rows are unchanged.
3. Only then enable it on a real community, keeping the direct providers live in
   parallel.
4. Cut the direct providers **after** Authentik has been verified, never before.

## Migrating the 3 existing identities

Do NOT rewrite `provider` on the existing rows — their `provider_subject` values are
Google's and Microsoft's `sub`, which are meaningless to Authentik.

The join key is email. `finalizeCommunityOAuthSignIn` calls
`ensureCommunityMembershipForEmail(sql, email, orgId)` before touching the identity
table, so a user who previously signed in with Google and now arrives via
Authentik-federated-Google lands on the **same** `fenrir_community_users` row as long
as the email matches. The old `google:` row simply goes dormant.

Two consequences worth stating plainly:

- If a user's Authentik account carries a different email than their old login, they
  land on a new user row. Verify the 3 emails match before cutover.
- Apple private-relay addresses (`@privaterelay.appleid.com`) are stable per Apple
  *app*, not per person. An Apple identity re-federated through Authentik gets a
  different relay alias, i.e. a different email — so Apple users cannot be silently
  migrated. There are currently zero Apple rows, which is the only reason this is
  cheap right now.

## Tests

`functions/__tests__/community-oauth.test.ts` — hermetic, no network, no Neon. The
Authentik block asserts the property that matters most for this rollout: with the flag
off, `availableCommunityAuthProviders()` is byte-identical to before.
