# fenrir-auth-worker

Fenrir **Better Auth** identity on a Cloudflare Worker. Public HTTP copies the
`folios-auth-worker` contract (endpoints, HMAC cookie, PKCE S256, Apple
`form_post` + ES256 client-secret JWT). This is **not** a Folios product merge:
cookie domain is `myfenrir.com`, Worker origin is `myfenrir.com/auth/*` and
`www.myfenrir.com/auth/*`. Fenrir login is never served on `folios.works`.

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
| GET | `https://myfenrir.com/auth/health` | Liveness |
| GET | `https://myfenrir.com/auth/ready` | Neon + session signing + all three providers; 503 until complete |

`?redirect=` is allow-listed to `myfenrir.com` / `www.myfenrir.com` (open-redirect
protection). `/auth/api/*`, KYC, passkeys, and extra providers are out.

## Session

Cookie `fenrir_session` = `<sessionId>.<HMAC-SHA256(sessionId, SESSION_SECRET)>`,
`HttpOnly; Secure; SameSite=Lax; Domain=myfenrir.com; Path=/`.

- **KV** (`SESSIONS`) holds short-lived OAuth state (PKCE verifier + returnTo).
- **Neon** holds `users` and `sessions`. Apply `neon/schema.sql`.

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
credentials returns `authenticated: true`. Telegram linking is the post-login
gate in the dashboard — this Worker does not create dens or chat IDs.

## KV namespace (human)

```bash
cd apps/fenrir-bridge
npx wrangler kv namespace create FENRIR_AUTH_SESSIONS --config wrangler.fenrir-auth.jsonc
```

Paste the id into `wrangler.fenrir-auth.jsonc` (`kv_namespaces[0].id`) before
the first production deploy.
