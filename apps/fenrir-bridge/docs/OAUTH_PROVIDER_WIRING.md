# OAuth Provider Wiring

Fenrir signs users in through Supabase Auth with three app providers:

- Google: `signInWithOAuth({ provider: "google" })`
- Microsoft: `signInWithOAuth({ provider: "azure" })`
- Apple: `signInWithOAuth({ provider: "apple" })`

## Production URLs

Use these values for the production app:

- App origin: `https://myfenrir.com`
- WWW origin: `https://www.myfenrir.com`
- App callback: `https://myfenrir.com/auth/callback`
- WWW callback: `https://www.myfenrir.com/auth/callback`
- Supabase provider callback: `https://<supabase-project-ref>.supabase.co/auth/v1/callback`

## Supabase Auth

In Supabase Authentication, enable Google, Azure, and Apple providers with their
provider client IDs and secrets.

In Supabase URL Configuration:

- Site URL: `https://myfenrir.com`
- Additional Redirect URLs:
  - `https://myfenrir.com/auth/callback`
  - `https://www.myfenrir.com/auth/callback`

## Google

In Google Auth Platform, create or edit the web OAuth client.

- Authorized JavaScript origins:
  - `https://myfenrir.com`
  - `https://www.myfenrir.com`
- Authorized redirect URI:
  - `https://<supabase-project-ref>.supabase.co/auth/v1/callback`

## Microsoft

The publisher-domain verification files are hosted from `public/.well-known/`:

- `microsoft-identity-association.json`
- `microsoft-identity-association`

Both must include application ID `bd7f4392-853c-4c41-89e7-443691424188`.

## Apple

For Sign in with Apple on the web, configure a Services ID and add:

- Web domain: `myfenrir.com`
- Return URLs:
  - `https://<supabase-project-ref>.supabase.co/auth/v1/callback`
  - `https://myfenrir.com/auth/callback`
  - `https://www.myfenrir.com/auth/callback`

Apple's current web Sign in with Apple setup does not require uploading a static
domain-association file for this Services ID flow.

## Fenrir Readiness Flags

After each provider is configured in the provider console and in Supabase, set
these Cloudflare Pages production variables:

```bash
FENRIR_GOOGLE_OAUTH_CONFIGURED=true
FENRIR_MICROSOFT_OAUTH_CONFIGURED=true
FENRIR_APPLE_OAUTH_CONFIGURED=true
```

`/api/readiness` uses these flags plus `SUPABASE_URL` and `SUPABASE_ANON_KEY`
to report whether Google, Microsoft, and Apple are ready.

## Neon Community Gate

The Community Gate uses a separate Neon Postgres database. Set this Cloudflare
Pages production variable after the Neon schema is applied:

```bash
NEON_DATABASE_URL=<pooled Neon connection string>
```

`/api/readiness` reports this as `billing.neonConfigured`. The paid-user launch
gate remains Telegram Stars + D1; Neon readiness is tracked separately for
Community Gate operations.
