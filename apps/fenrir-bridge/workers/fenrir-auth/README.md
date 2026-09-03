# fenrir-auth-worker

Fenrir **Better Auth** identity on a Cloudflare Worker. Public HTTP copies the
`folios-auth-worker` contract (endpoints, HMAC cookie, PKCE S256, Apple
`form_post` + ES256 client-secret JWT). This is **not** a Folios product merge:
cookie domain is `myfenrir.com`, Worker origin is `myfenrir.com/auth/*` and
`www.myfenrir.com/auth/*`, plus Telegram identity link on `/api/telegram/link*`.
Fenrir login is never served on `folios.works`.

Authentic / the `fenrir-auth-proxy` Supabase broker on `auth.myfenrir.com` is
retired (410).

## Endpoints

| Method | URL | Purpose |
|---|---|---|
| GET | `https://myfenrir.com/auth/google` | Start Google login → 302 to Google |
| GET | `https://myfenrir.com/auth/microsoft` | Start Microsoft login → 302 to Microsoft |
| GET | `https://myfenrir.com/auth/apple` | Start Apple login → 302 to Apple |
| GET/POST | `https://myfenrir.com/auth/{provider}/callback` | Provider redirect target |
| GET | `https://myfenrir.com/auth/me` | `{ "authenticated": false }` or `{ "authenticated": true, "user": {…} }` |
| GET | `https://myfenrir.com/auth/logout` | Clears session + cookie, 302 to `/login` |
| GET | `https://myfenrir.com/auth/providers` | Which providers can start |
| GET | `https://myfenrir.com/auth/health` | Liveness only — do **not** gate login on this |
| GET | `https://myfenrir.com/auth/ready` | Session secret + all three providers + (Neon **or** KV); 503 only when login cannot mint a session |
| GET | `https://myfenrir.com/api/telegram/link/start` | Unauthenticated 302 `/login?next=/api/telegram/link/start`; signed-in 302 `t.me/Myfenrir_bot?start=link_<code>` |
| POST | `https://myfenrir.com/api/telegram/link` | Mint the same one-time code against `fenrir_session`. Unauthenticated `{ error: authentication_required }` |

`?redirect=` is allow-listed to `myfenrir.com` / `www.myfenrir.com` (open-redirect
protection). `/auth/api/*`, KYC, passkeys, and extra providers are out.
Do not register `/auth/callback` (returns `unknown_provider`).

## Telegram identity vs VC (two-bot split)

- Community / identity: **@Myfenrir_bot** via `/api/telegram/link*` after `fenrir_session`.
- VC / TeleConnect: **@MyFenrirTeleConnectBot** on `vc.friskydev.com`. Do not touch it.
- Community Gate webhook stays `gate.myfenrir.com/tg`. This Worker does not steal it.

`www.myfenrir.com` 301s to the apex (Pages `_redirects` + `fenrir-redirects`).
Worker routes remain on both hosts. Browser OAuth failures 302 to
`/login?error=…` (HTML Accept); API clients still get JSON. CORS credentials
are allowed for `https://www.myfenrir.com` so the www SPA can call apex `/auth/me`.

## Session

Cookie `fenrir_session` = `<sessionId>.<HMAC-SHA256(sessionId, SESSION_SECRET)>`,
`HttpOnly; Secure; SameSite=Lax; Domain=myfenrir.com; Path=/`.

- **KV** (`SESSIONS`) holds short-lived OAuth state (PKCE verifier + returnTo)
  and is the **session fallback** when Neon is unset or unreachable.
- **Durable Objects** (`SESSION_AUTHORITY`) serialize each user's complete KV
  session index and provide strongly consistent active/revoked session state.
- **Neon** holds `users` and `sessions` when `DATABASE_URL` is healthy. Apply
  `neon/schema.sql`. Login stays up on KV until then (`degraded: true`).

## Secrets (existing names — do not invent credentials)

Set with `wrangler secret put <NAME> --config wrangler.fenrir-auth.jsonc`.

| Secret | Also accepted | What it is |
|---|---|---|
| `SESSION_SECRET` | `BETTER_AUTH_SECRET` | HMAC key for `fenrir_session` |
| `DATABASE_URL` | `NEON_DATABASE_URL` | Pooled Neon connection |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | | Google OAuth web client |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | `MS_CLIENT_ID` / `MS_CLIENT_SECRET` | Entra ID web app |
| `APPLE_CLIENT_ID` | | Services ID |
| `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | | Sign in with Apple `.p8` |

## Human-only callback mapping

Map the existing OAuth apps onto Fenrir (keep any old URLs until consoles are updated):

- Google Authorized redirect URI: `https://myfenrir.com/auth/google/callback`
- Microsoft (Entra) Web redirect URI: `https://myfenrir.com/auth/microsoft/callback`
- Apple Services ID Return URL: `https://myfenrir.com/auth/apple/callback`
- Apple domains: `myfenrir.com` (and `www.myfenrir.com` if used)

Optional JS origins: `https://myfenrir.com`, `https://www.myfenrir.com`.

## Verify (after secrets + callbacks)

```bash
cd apps/fenrir-bridge/workers/fenrir-auth
npm test

curl -sS https://myfenrir.com/auth/health
curl -sS https://myfenrir.com/auth/providers
curl -sS https://myfenrir.com/auth/ready
curl -sI "https://myfenrir.com/auth/google?redirect=/main"
```

Google/Microsoft should 302 to the IdP with `redirect_uri=https://myfenrir.com/auth/{provider}/callback`
and PKCE `S256`. Apple 302s with `response_mode=form_post`. Then click through
https://myfenrir.com/login (private-access gate) and confirm `GET /auth/me` with
credentials returns `authenticated: true`. Then `GET /api/telegram/link/start`
should 302 to `t.me/Myfenrir_bot?start=link_…`. This Worker does not create Telegram identity links.

Operator leftovers (not this Worker deploy): bind Neon so `/auth/ready` is not
`degraded`, `login.myfenrir.com` DNS, Cloudflare MCP reconnect. Do not invent
secrets or new OAuth clients.

## KV namespace (human)

```bash
cd apps/fenrir-bridge
npx wrangler kv namespace create FENRIR_AUTH_SESSIONS --config wrangler.fenrir-auth.jsonc
```

Paste the id into `wrangler.fenrir-auth.jsonc` (`kv_namespaces[0].id`) before
the first production deploy.
