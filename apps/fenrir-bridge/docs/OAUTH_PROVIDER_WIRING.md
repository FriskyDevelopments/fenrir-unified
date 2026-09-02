# App Login OAuth Provider Wiring (myfenrir.com)

MyFenrir app login (who is this user?) is layered, in this order of precedence:

1. **Fenrir Better Auth Worker** — a Cloudflare Worker (`fenrir-auth-worker`) on
   `https://myfenrir.com/auth/*`. It copies the **folios-auth-worker** HTTP
   contract. Cookie domain is **myfenrir.com**. This is the current production
   identity plane when the Worker is live.
2. **Better Auth (`@frisky/auth`)** at `/api/frisky-auth/*`, once
   `FRISKY_AUTH_ENABLED=1`. See `docs/FRISKY_AUTH_MIGRATION.md`.
3. **Leftover direct OAuth** under `/api/auth/*` — the pre-Worker, pre-Better-Auth
   operator fallback path. Used only when neither of the above is live.

The SPA must not treat Authentik or Firebase as the app IdP. Authentik / the
Supabase broker on `auth.myfenrir.com` is retired.

Community Gate (Neon) OAuth endpoints remain a **separate** membership plane:

- Google: `/api/community-auth/oauth/google`
- Microsoft: `/api/community-auth/oauth/microsoft`
- Apple: `/api/community-auth/oauth/apple`

The Fenrir MCP beta worker authenticates with a static bearer token
(`FRISKY_BOT_API_TOKEN`); it has no OAuth discovery endpoints.

## Production URLs

- App / private-access gate: `https://myfenrir.com/login`
- `www.myfenrir.com` 301s to the apex (Pages `_redirects` + `fenrir-redirects`).
  Worker routes remain on both hosts; the www SPA calls apex `/auth/*`.
- Fenrir Better Auth Worker:
  - Google start: `https://myfenrir.com/auth/google`
  - Microsoft start: `https://myfenrir.com/auth/microsoft`
  - Apple start: `https://myfenrir.com/auth/apple`
  - Callbacks: `https://myfenrir.com/auth/{google|microsoft|apple}/callback`
- Better Auth (`@frisky/auth`, once `FRISKY_AUTH_ENABLED=1`):
  - `https://www.myfenrir.com/api/frisky-auth/callback/google`
  - `https://www.myfenrir.com/api/frisky-auth/callback/microsoft`
  - `https://www.myfenrir.com/api/frisky-auth/callback/apple` (not live until `APPLE_CLIENT_SECRET`)
- Leftover direct OAuth (final fallback only):
  - Google callback: `https://auth.myfenrir.com/api/auth/callback/google`
  - Microsoft callback: `https://auth.myfenrir.com/api/auth/callback/microsoft`
  - Apple callback: `https://auth.myfenrir.com/api/auth/callback/apple`

## Do not register these (they cause `unknown_provider`)

```text
https://www.myfenrir.com/auth/callback
https://myfenrir.com/auth/callback
https://www.myfenrir.com/auth/callback/google
https://auth.myfenrir.com/api/auth/callback/google
https://www.myfenrir.com/api/auth/callback/google
https://www.myfenrir.com/api/frisky-auth/callback/google
```

`/auth/callback` is parsed as provider name `callback`. Live proof:
`GET /auth/callback` → `{"error":"unknown_provider","provider":"callback"}`.

Step-by-step consoles: [OAUTH_CONSOLE_REDIRECTS.md](./OAUTH_CONSOLE_REDIRECTS.md).

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

`/auth/ready` is degraded while `database: false`. KV can still mint sessions.

## Telegram identity (two-bot split)

After OAuth, `fenrir_session` can start a Telegram identity link:

- Start: `GET https://myfenrir.com/api/telegram/link/start`
- Complete mint: `POST https://myfenrir.com/api/telegram/link`
- Bot: **@Myfenrir_bot** (`t.me/Myfenrir_bot?start=link_<code>`)
- Do not use **@MyFenrirTeleConnectBot** (VC / `vc.friskydev.com`)
- Do not move the Community Gate webhook off `gate.myfenrir.com/tg`

## Operator leftovers

Not code in this repo:

- Bind Neon `DATABASE_URL` so `/auth/ready` reports `database: true` / not degraded
- `login.myfenrir.com` DNS
- Cloudflare MCP reconnect

Do not create new OAuth clients. Live IDs:

- Google `411033642222-3cbc7g2sjq9navh6lqfuclhbj0hj4cp4`
- Microsoft `bd7f4392-853c-4c41-89e7-443691424188`
- Apple Services ID `com.myfenrir.FenrirProtocol`

## Out of scope

`/auth/api/*`, KYC/KYB, CFDI, timbrado, passkeys, extra providers, Telegram dens.
