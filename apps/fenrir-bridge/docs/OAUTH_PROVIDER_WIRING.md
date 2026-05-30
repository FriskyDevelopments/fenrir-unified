# Direct OAuth Provider Wiring

Fenrir signs users in directly with four providers:

- Google: `/api/auth/login/google`
- Microsoft: `/api/auth/login/microsoft`
- Apple: `/api/auth/login/apple`
- WorkOS AuthKit: `/api/auth/login/workos`

WorkOS is the preferred provider for MCP clients — it handles SSO, social login,
and issues JWTs that the MCP worker validates automatically via WorkOS JWKS.

## WorkOS MCP Login Flow (seamless)

MCP clients (Claude Desktop, Cursor, etc.) discover auth automatically:

1. Client hits `POST /mcp` without a token → `401` with
   `WWW-Authenticate: Bearer resource_metadata="https://www.myfenrir.com/.well-known/oauth-protected-resource"`
2. Client fetches `/.well-known/oauth-protected-resource` → lists WorkOS as auth server
3. Client fetches `/.well-known/oauth-authorization-server` → WorkOS PKCE endpoints
4. Client performs PKCE flow → WorkOS issues an access token (JWT)
5. Client sends `Authorization: Bearer <workos_jwt>` → MCP worker validates via JWKS
6. Seamless from the user's perspective — one browser prompt, then the MCP just works

The callback validates the OAuth transaction cookie, PKCE verifier, state,
nonce, and OIDC ID token before minting `fenrir_session`.

## Production URLs

Use these values for the production app:

- App origin: `https://myfenrir.com`
- WWW origin: `https://www.myfenrir.com`
- Auth origin: `https://auth.myfenrir.com`
- Google callback: `https://auth.myfenrir.com/api/auth/callback/google`
- Microsoft callback: `https://auth.myfenrir.com/api/auth/callback/microsoft`
- Apple callback: `https://auth.myfenrir.com/api/auth/callback/apple`

## WorkOS

In the [WorkOS Dashboard](https://dashboard.workos.com):

1. Create an app → copy **Client ID** and **API Key**
2. Under **Redirects**, add:
   - `https://auth.myfenrir.com/api/auth/callback/workos`
3. Enable social providers (Google, Microsoft, Apple) inside WorkOS so you can
   consolidate all SSO through one WorkOS app instead of three direct integrations
4. Set Worker vars/secrets:

```bash
# var (public, safe to commit after filling in)
WORKOS_CLIENT_ID = "client_..."

# secret (never commit)
wrangler secret put WORKOS_API_KEY --config wrangler.fenrir-mcp-beta.toml
```

Also add to Cloudflare Pages production environment:
```bash
WORKOS_CLIENT_ID=client_...
WORKOS_API_KEY=<secret>
```

## Google

In Google Auth Platform, create or edit the web OAuth client.

- Authorized JavaScript origins:
  - `https://myfenrir.com`
  - `https://www.myfenrir.com`
  - `https://auth.myfenrir.com`
- Authorized redirect URI:
  - `https://auth.myfenrir.com/api/auth/callback/google`

## Microsoft

In Microsoft Entra, configure the web redirect URI:

- `https://auth.myfenrir.com/api/auth/callback/microsoft`

The publisher-domain verification files are hosted from `public/.well-known/`
and must be reachable on `https://auth.myfenrir.com/.well-known/`:

- `microsoft-identity-association.json`
- `microsoft-identity-association`

Both must include application ID `bd7f4392-853c-4c41-89e7-443691424188`.

## Apple

For Sign in with Apple on the web, configure a Services ID and add:

- Web domain: `myfenrir.com`
- Web domain: `auth.myfenrir.com`
- Return URLs:
  - `https://auth.myfenrir.com/api/auth/callback/apple`

Apple's current web Sign in with Apple setup does not require uploading a static
domain-association file for this Services ID flow.

## Fenrir Readiness Flags

Set these Cloudflare Pages production variables:

```bash
SESSION_SECRET=
VITE_DIRECT_AUTH_ORIGIN=https://auth.myfenrir.com
PUBLIC_SITE_URL=https://www.myfenrir.com
PUBLIC_AUTH_URL=https://auth.myfenrir.com
WORKOS_CLIENT_ID=
WORKOS_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
```

After each provider is configured in the provider console, set:

```bash
FENRIR_GOOGLE_OAUTH_CONFIGURED=true
FENRIR_MICROSOFT_OAUTH_CONFIGURED=true
FENRIR_APPLE_OAUTH_CONFIGURED=true
```

`/api/readiness` treats the direct provider credentials as readiness signals.

## Neon Community Gate

The Community Gate uses a separate Neon Postgres database. Set this Cloudflare
Pages production variable after the Neon schema is applied:

```bash
NEON_DATABASE_URL=<pooled Neon connection string>
```

`/api/readiness` reports this as `billing.neonConfigured`. The paid-user launch
gate remains Telegram Stars + D1; Neon readiness is tracked separately for
Community Gate operations.
