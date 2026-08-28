# Fenrir Better Auth identity (myfenrir.com)

Fenrir login is a Cloudflare Worker (`fenrir-auth-worker`) on
`https://myfenrir.com/auth/*`. It copies the **folios-auth-worker** HTTP
contract. The session cookie is host-only on the canonical **myfenrir.com** host. Do not put Fenrir login on
folios.works.

Authentic / the `fenrir-auth-proxy` Supabase broker on `auth.myfenrir.com` is
retired.

## Production URLs

- App / private-access gate: `https://myfenrir.com/login`
- `www.myfenrir.com` 301s to the apex (Pages `_redirects` + `fenrir-redirects`).
  Worker routes remain on both hosts; the www SPA calls apex `/auth/*`.
- Google start: `https://myfenrir.com/auth/google`
- Microsoft start: `https://myfenrir.com/auth/microsoft`
- Apple start: `https://myfenrir.com/auth/apple`
- Callbacks: `https://myfenrir.com/auth/{google|microsoft|apple}/callback`

## Google

In Google Auth Platform, edit the existing web OAuth client (do not invent a new
client id). Authorized redirect URI — add exactly:

- `https://myfenrir.com/auth/google/callback`

Authorized JavaScript origins (optional for this server-side code flow):

- `https://myfenrir.com`
- `https://www.myfenrir.com`

## Microsoft

In Entra ID, edit the existing app registration. Web redirect URI — add exactly:

- `https://myfenrir.com/auth/microsoft/callback`

## Apple

Sign in with Apple Services ID — add:

- Domains: `myfenrir.com`
- Return URL: `https://myfenrir.com/auth/apple/callback`

Apple posts the callback (`form_post`). The Worker already accepts POST.

## Worker secrets (existing names)

These values belong to `fenrir-auth-worker`, not the Cloudflare Pages project.
Pages also requires its own `SESSION_SECRET`; configure the secret in both runtimes
because Worker secrets are not inherited by Pages.

```bash
SESSION_SECRET=
# alias: BETTER_AUTH_SECRET

DATABASE_URL=
# alias: NEON_DATABASE_URL

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
# aliases: MS_CLIENT_ID / MS_CLIENT_SECRET

APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
```

Apply `workers/fenrir-auth/neon/schema.sql` on the Fenrir Neon database. Wrangler
automatically provisions the `SESSIONS` KV namespace when its id is omitted.

## Out of scope

`/auth/api/*`, KYC/KYB, CFDI, timbrado, passkeys, extra providers, Telegram dens.
Telegram linking stays the post-login gate in the Fenrir dashboard.
