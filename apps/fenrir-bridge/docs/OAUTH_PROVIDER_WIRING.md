# Direct / leftover OAuth Provider Wiring

MyFenrir **app login** is Better Auth (`@frisky/auth`) at `/api/frisky-auth/*`
once `FRISKY_AUTH_ENABLED=1`. See `docs/FRISKY_AUTH_MIGRATION.md`.

The SPA must not treat Authentik or Firebase as the app IdP.

Community Gate (Neon) OAuth endpoints remain a **separate** membership plane:

- Google: `/api/community-auth/oauth/google`
- Microsoft: `/api/community-auth/oauth/microsoft`
- Apple: `/api/community-auth/oauth/apple`

The Fenrir MCP beta worker authenticates with a static bearer token
(`FRISKY_BOT_API_TOKEN`); it has no OAuth discovery endpoints.

Leftover direct `/api/auth/callback/*` routes below are the pre-Better-Auth
operator path. Prefer the Better Auth callbacks in the migration doc.

## Production URLs

Use these values for the production app:

- App origin: `https://myfenrir.com`
- WWW origin: `https://www.myfenrir.com`
- Auth origin: `https://auth.myfenrir.com`
- Better Auth (app login, once `FRISKY_AUTH_ENABLED=1`):
  - `https://www.myfenrir.com/api/frisky-auth/callback/google`
  - `https://www.myfenrir.com/api/frisky-auth/callback/microsoft`
  - `https://www.myfenrir.com/api/frisky-auth/callback/apple` (not live until `APPLE_CLIENT_SECRET`)
- Leftover direct OAuth (cutover fallback only):
  - Google callback: `https://auth.myfenrir.com/api/auth/callback/google`
  - Microsoft callback: `https://auth.myfenrir.com/api/auth/callback/microsoft`
  - Apple callback: `https://auth.myfenrir.com/api/auth/callback/apple`

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
