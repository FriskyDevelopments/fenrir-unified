# OAuth Provider Wiring

MyFenrir sign-in is **Supabase-only**: the client calls
`supabase.auth.signInWithOAuth` against the canonical project
(`yqevglppbhuoxxfsfnih`), which fronts Google (`google`), Microsoft (`azure`)
and Apple (`apple`). No external auth broker is allowed (banned, same status
as Vercel). The legacy per-provider endpoints below exist only as retired
stubs (`/api/auth/login/:provider` → 302 `/login`, callbacks → 410).

## MCP Login Flow (Supabase authorization server)

MCP clients (Claude Desktop, Cursor, etc.) discover auth automatically:

1. Client hits `POST /mcp` without a token → `401` with
   `WWW-Authenticate: Bearer resource_metadata="https://www.myfenrir.com/.well-known/oauth-protected-resource"`
2. Client fetches `/.well-known/oauth-protected-resource` → lists the Supabase
   auth server (`https://yqevglppbhuoxxfsfnih.supabase.co/auth/v1`)
3. Client fetches `/.well-known/oauth-authorization-server` → Supabase OAuth
   PKCE endpoints (`/oauth/authorize`, `/oauth/token`)
4. Client performs PKCE flow → Supabase issues an access token (JWT)
5. Client sends `Authorization: Bearer <jwt>` → MCP worker validates it against
   the project's JWKS (`/auth/v1/.well-known/jwks.json`)
6. Seamless from the user's perspective — one browser prompt, then the MCP just works

## Production URLs

Use these values for the production app:

- App origin: `https://myfenrir.com`
- WWW origin: `https://www.myfenrir.com`
- Auth origin: `https://auth.myfenrir.com`
- Google callback: `https://auth.myfenrir.com/api/auth/callback/google`
- Microsoft callback: `https://auth.myfenrir.com/api/auth/callback/microsoft`
- Apple callback: `https://auth.myfenrir.com/api/auth/callback/apple`

## Supabase (the login broker)

In the Supabase dashboard for `yqevglppbhuoxxfsfnih`:

1. Authentication → Providers: enable Google, Azure (Microsoft) and Apple with
   their provider-console credentials.
2. Authentication → URL Configuration: allow-list the app origins
   (`https://www.myfenrir.com`, `https://communities.myfenrir.com`).
3. Cloudflare Pages production environment:

```bash
SUPABASE_URL=https://yqevglppbhuoxxfsfnih.supabase.co
SUPABASE_ANON_KEY=<publishable key>
SUPABASE_SERVICE_ROLE_KEY=<secret>
```

The sections below document the DIRECT per-provider consoles. They only matter
if the retired direct stack is ever deliberately revived; the live login uses
the Supabase callback (`https://yqevglppbhuoxxfsfnih.supabase.co/auth/v1/callback`)
in each provider console instead.

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
