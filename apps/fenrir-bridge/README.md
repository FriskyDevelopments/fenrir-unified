# Fenrir Telegram Lock by Frisky

Production-shaped SaaS MVP for locking Telegram group access behind customer-owned domains.

Fenrir is Telegram-only in this MVP. The domain bridge is infrastructure: admins share a stable lock URL, and Fenrir rotates or revokes the Telegram invite behind it.

## What Works Now

- Logged-in admin product shell with real Google, Microsoft, and Apple OAuth entrypoints on Cloudflare Pages Functions
- Frisky IDs for users, orgs, domains, Telegram locks, invites, and audit logs
- Domain management and DNS wizard
- Cloudflare-first DNS/certificate flow mock
- Public `/join/:slug` route mock
- Telegram Lock create, rotate, revoke, and copy actions
- Cloudflare Live Rooms for Zoom, Webex, Whereby, Google Meet, or any call URL, available from paid plans only
- EN / ES / FR / DE language switcher
- Spanish-first UX fallback, then EN / FR / DE
- Domain onboarding paths for users with no domain: instant Fenrir subdomain, bring/buy domain, or concierge later
- Telegram permission check mock
- Revocation timeline
- Audit log
- Cheap pricing cards
- Jules, Gemini, Cursor ops stubs
- Commission links and future Telegram Lock domain buyer placeholder
- Dynadot Ambassador primary domain path with CJ fallback placeholders

## Run

```sh
npm install
npm run dev
```

Open:

```text
http://localhost:5177/
http://localhost:5177/join/main
http://localhost:5177/room/access-room
http://localhost:5177/go/dynadot
http://localhost:5177/legal
http://localhost:5177/terms
http://localhost:5177/privacy
```

## Deployment

```sh
npm run deploy
```

The app deploys to **Cloudflare Pages** project `fenrir-bridge`.
Cloudflare deploy auth is Wrangler OAuth. Run `wrangler login` in the browser and do not store a Cloudflare Global API Key or `CLOUDFLARE_API_TOKEN` in the local safe box.

## Production verification

Basic public route checks:

```sh
npm run verify:prod
```

Readiness launch gate checks:

```sh
npm run verify:readiness
```

Without a session cookie, `verify:readiness` confirms `/api/readiness` rejects anonymous requests with `authentication_required`. To verify the authenticated launch gate, pass a browser-captured session cookie through the shell environment:

```sh
FENRIR_SESSION_COOKIE='fenrir_session=...' npm run verify:readiness
```

The authenticated check expects `app.readyForPaidUsers` to be `true` by default. For a shape-only check during setup, run:

```sh
FENRIR_EXPECT_PAID_READY=false FENRIR_SESSION_COOKIE='fenrir_session=...' npm run verify:readiness
```

### Google Cloud Run deploy path

Use this when Fenrir Bridge needs a Google-hosted web surface:

```sh
npm run deploy:gcloud
```

Defaults:

```text
service: fenrir-bridge
project: gen-lang-client-0202582192
region:  us-central1
```

Override them when needed:

```sh
FENRIR_GCLOUD_SERVICE=fenrir-bridge \
GCP_PROJECT=gen-lang-client-0202582192 \
GCP_REGION=us-central1 \
npm run deploy:gcloud
```

The Cloud Run path builds the existing `Dockerfile`, serves the Vite bundle with nginx on port `80`, and passes only safe public `VITE_*` build variables from `.env.local` or the shell. Do not pass server secrets such as `SUPABASE_SERVICE_ROLE_KEY`, `NEON_DATABASE_URL`, Stripe secrets, Telegram bot tokens, or Cloudflare tokens as Docker build args.

Current Cloud Run service URL:

```text
https://fenrir-bridge-5nznlsxd7a-uc.a.run.app
```

Recommended Supabase Auth setup for real admin login:

```sh
SESSION_SECRET=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_ADMIN_EMAILS=
```

Vite client variables for the Supabase web app:

```sh
VITE_SUPABASE_URL=https://yqevglppbhuoxxfsfnih.supabase.co
VITE_SUPABASE_ANON_KEY=
VITE_AUTH_REDIRECT_ORIGIN=https://www.myfenrir.com
VITE_AUTH_REDIRECT_PATH=/auth/callback
VITE_FENRIR_MANAGED_URL=https://www.myfenrir.com/main
VITE_CUSTOM_DOMAIN_URL=
```

Enable Google, Azure/Microsoft, and Apple in Supabase Auth > Providers. Supabase stores the provider client IDs/secrets; Cloudflare verifies Supabase access tokens with `SUPABASE_URL` and `SUPABASE_ANON_KEY`, then mints Fenrir's HttpOnly session cookie. `SUPABASE_ADMIN_EMAILS` is optional but recommended; use a comma-separated allowlist for dashboard admins.

Direct provider OAuth through Fenrir is disabled. Do not register provider callbacks to `/api/auth/callback/:provider`; register the Supabase Auth callback URL instead.

This free setup uses the raw Supabase project callback host. For production branding, Supabase Auth can later run behind the Frisky-owned custom auth domain after that paid Supabase feature is enabled and verified.

Required provider callback URL for Google, Microsoft, and Apple:

```text
https://yqevglppbhuoxxfsfnih.supabase.co/auth/v1/callback
```

Required app redirect URL inside Supabase Auth URL settings:

```text
https://www.myfenrir.com/auth/callback
```

Required Cloudflare auth variables:

```sh
SESSION_SECRET=
SUPABASE_URL=https://yqevglppbhuoxxfsfnih.supabase.co
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ADMIN_EMAILS=
FENRIR_CANONICAL_ORIGIN=https://www.myfenrir.com
```

The service-role key is server-only. It is used by Fenrir Supabase Edge Functions to verify owner/admin membership from `user_roles` instead of trusting stale JWT role claims.

Apple notes:

- Apple provider secrets live in Supabase Auth, not Cloudflare Pages.
- Apple posts callbacks with `response_mode=form_post`; Supabase receives the provider callback and Fenrir only exchanges a Supabase access token for its HttpOnly session cookie.

## Cursor Stripe Handoff

Stripe implementation scope for Cursor:

```text
docs/CURSOR_STRIPE_HANDOFF.md
```

This handoff covers checkout, portal, webhook, billing status, env vars, security rules, D1 schema direction, and acceptance checks.

Production target is explicitly Cloudflare Pages. Keep the runtime and DNS wiring in one place instead of shipping to extra hosts.

## Cloudflare Live Rooms

Live Rooms use the same domain layer for calls:

```text
https://www.myfenrir.com/access-room
```

That stable URL can point to Zoom, Webex, Whereby, Google Meet, or any meeting URL. Cloudflare makes this easy because Fenrir verifies DNS once, keeps SSL automatic, and only rotates the provider target behind the branded room URL.

Live Rooms are not included in Free. They become available from Starter and above.

## Domain Onboarding

If a customer does not have a domain, Fenrir can still onboard them:

1. Start instantly with a managed Fenrir URL such as `https://www.myfenrir.com/main`, then switch `VITE_CUSTOM_DOMAIN_URL` to the verified customer domain when DNS is ready.
2. Let them bring or buy a custom domain later.
3. Offer a concierge/domain buyer layer later for branded domains, Dynadot, and auctions.

This follows the same low-friction product idea as ClipsFlow: let the user start before every external setup detail is perfect.

## Commerce Layer

The DNS wizard includes tracked setup links for Telegram Lock setup:

- `/go/dynadot` — primary domain buying path, Ambassador pending
- `/go/dynadot-auctions` — auctions/backorders path
- `/go/cj-dynadot` — CJ fallback if Ambassador signup fails
- `/go/cloudflare` — DNS reliability path
- `/go/namecheap` — fallback registrar path
- `https://m.do.co/c/e31bed76086e` — DigitalOcean referral for operator bot hosting and infra credits

These are placeholders today. Replace them with server-side redirects to the approved partner URLs.

## Product notes

- DNS setup and escalation paths are expected to point to customer-owned or Frisky-owned infrastructure under Cloudflare.
- All operator links, auth callbacks, and launch routes should stay inside the Fenrir Bridge / Frisky-owned Cloudflare surface.
- Owner/admin operating guidance for MyFenrir, the early-adopter Telegram group, moderation, bans, and Neon Nexus lives in `docs/MYFENRIR_ADMIN_GUIDE.md`.
- Launch status is conditional: GO for private alpha / controlled beta, NO-GO for paid public launch until `docs/MYFENRIR_ALPHA_LAUNCH_GATE.md` is satisfied.

## Public Legal Center

The legal center is public and does not require admin login:

```text
/legal
/terms
/privacy
/acceptable-use
```

It includes Terms, Privacy, Acceptable Use, Payments & Refunds, and legal contact copy. Treat it as an MVP legal baseline and send it through counsel before scaling paid production.

## Cloudflare Certificate Flow

The product now proposes Cloudflare DNS as the recommended setup for custom Telegram Lock URLs:

1. Customer buys or keeps the domain at any registrar.
2. Customer changes nameservers to Cloudflare.
3. Fenrir checks TXT/CNAME records.
4. Fenrir requests the custom hostname/certificate through Cloudflare.
5. Status moves from `dns_pending` to `issuing` to `active`.

Production env later for automated customer-domain provisioning only:

```sh
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_ZONE_ID=
CLOUDFLARE_FALLBACK_ORIGIN=
```

DigitalOcean badge:

```html
<a href="https://www.digitalocean.com/?refcode=e31bed76086e&utm_campaign=Referral_Invite&utm_medium=Referral_Program&utm_source=badge"><img src="https://web-platforms.sfo2.cdn.digitaloceanspaces.com/WWW/Badge%201.svg" alt="DigitalOcean Referral Badge" /></a>
```

## Backend-Ready Services

Business logic is separated under `src/services`. The UI says Telegram Lock, while the internal service name still uses bridge terminology so the backend can later expose stable redirect primitives cleanly:

- `authService`
- `domainService`
- `bridgeService`
- `telegramService`
- `aiOpsService`
- `mockStore`

The first backend layer now exists under `functions/api`:

- `POST /api/auth/supabase-session`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/app-state`

Legacy direct OAuth routes return `410 direct_oauth_disabled`; provider login must start from Supabase Auth in the frontend.

## Next Real Backend Step

Replace remaining mock services with API routes:

- `POST /api/domains`
- `POST /api/domains/:id/check-dns`
- `GET /api/bridges`
- `POST /api/bridges`
- `POST /api/bridges/:id/rotate`
- `POST /api/bridges/:id/revoke`
- `POST /api/telegram/check-permissions`
- `GET /api/audit`
- `GET /join/:slug`
