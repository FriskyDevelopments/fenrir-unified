# Fenrir Better Auth identity (myfenrir.com)

Fenrir login is a Cloudflare Worker (`fenrir-auth-worker`) on
`https://myfenrir.com/auth/*`. It copies the **folios-auth-worker** HTTP
contract. Cookie domain is **myfenrir.com**. Do not put Fenrir login on
folios.works.

Authentic / the `fenrir-auth-proxy` Supabase broker on `auth.myfenrir.com` is
retired.

## Production URLs

- App / private-access gate: `https://myfenrir.com/login`
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

Apply `workers/fenrir-auth/neon/schema.sql` on the Fenrir Neon database. Create
the KV namespace and paste its id into `wrangler.fenrir-auth.jsonc`.

## Out of scope

`/auth/api/*`, KYC/KYB, CFDI, timbrado, passkeys, extra providers, Telegram dens.
Telegram linking stays the post-login gate in the Fenrir dashboard.
