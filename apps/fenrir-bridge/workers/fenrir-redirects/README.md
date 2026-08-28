# fenrir-redirects — handoff (deploy is a manual step, NOT done from the sandbox)

Edge Worker that canonicalizes `myfenrir.com` traffic. It is bound to routes on
BOTH hostnames, so it runs **before** the Pages origin for unmatched paths.
Treat activation as a production change.

## Canonical = apex (`myfenrir.com`)

This Worker redirects **www → apex** (`www.myfenrir.com` → `myfenrir.com`) and
upgrades HTTP to HTTPS. That matches:

- Cookie `fenrir_session` `Domain=myfenrir.com`
- Better Auth callbacks `https://myfenrir.com/auth/{provider}/callback`
- `index.html` canonical + `og:url` on the apex
- Folios#29 go-live login (www without an auth Worker route looked broken)

More-specific Workers still win:

- `fenrir-auth-worker` on `myfenrir.com/auth/*` and `www.myfenrir.com/auth/*`
- `fenrir-gate-router` on `www.myfenrir.com/gate/*` (Telegram Mini App stays on www)

Do not bind this Worker to a more-specific pattern than `/*`.

## ⚠️ Status: NOT deployed

The build sandbox has **no network path to Cloudflare** (dashboard/API blocked by
an allowlist proxy) and **wrangler is not authenticated** (`wrangler login` is
interactive OAuth, impossible headless). This Worker was authored and committed
but **not deployed and not live-verified**. Deploy + curl from an authenticated
machine.

## ⚠️ Pre-activation checklist

1. Confirm the Pages project (`fenrir-bridge`) custom domains include **apex**.
   www 301s to apex, so apex must serve the same origin.
2. Keep `fenrir-auth-worker` and `fenrir-gate-router` routes in place **before**
   activating this catch-all so `/auth/*` and `/gate/*` are not stolen.
3. Force-HTTPS: either this Worker (http block) or the dashboard toggle
   (SSL/TLS → Edge Certificates → Always Use HTTPS). Pick one.

## Deploy (from an authenticated machine — wrangler OAuth, no API token)
```bash
cd apps/fenrir-bridge/workers/fenrir-redirects
env -u CLOUDFLARE_API_TOKEN npx wrangler@4 login
env -u CLOUDFLARE_API_TOKEN npx wrangler@4 deploy
```

## Verify LIVE immediately after deploy
```bash
curl -sSI http://myfenrir.com/       # 301 -> https://myfenrir.com/
curl -sSI https://www.myfenrir.com/login  # 301 -> https://myfenrir.com/login
curl -sSI https://myfenrir.com/login     # 200 (Pages) or the login shell
curl -sSI https://myfenrir.com/auth/health  # 200 fenrir-auth-worker (more-specific route)
curl -sSI https://www.myfenrir.com/auth/health  # 200 same Worker (route still on www)
```

## Rollback
If anything breaks: delete the routes / delete the Worker in the dashboard
(Workers & Pages → fenrir-redirects), or:
```bash
env -u CLOUDFLARE_API_TOKEN npx wrangler@4 delete --name fenrir-redirects
```
Removing the Worker restores direct Pages serving on both hostnames. Pages
`_redirects` still 301s www → apex for requests that reach Pages.
