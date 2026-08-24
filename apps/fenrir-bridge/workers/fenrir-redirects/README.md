# fenrir-redirects — handoff (deploy is a manual step, NOT done from the sandbox)

Edge Worker that canonicalizes `myfenrir.com` traffic. It is bound to routes on
BOTH hostnames, so it runs **before** the Pages origin and sees 100% of prod
traffic. Treat activation as a production change.

## ⚠️ Status: NOT deployed
The build sandbox has **no network path to Cloudflare** (dashboard/API blocked by
an allowlist proxy) and **wrangler is not authenticated** (`wrangler login` is
interactive OAuth, impossible headless). So this Worker was authored and
committed but **not deployed and not live-verified**. Francisco must run the
deploy + curl checks below from an authenticated machine.

## ⚠️ Canonical-direction conflict — decide before activating apex→www
This Worker redirects **apex → www** (`myfenrir.com` → `www.myfenrir.com`).
But the repo currently canonicalizes on the **APEX**:

- `index.html`: `<link rel="canonical" href="https://myfenrir.com/">` and `og:url` = apex
- `wrangler.jsonc`: `PUBLIC_SITE_URL = "https://myfenrir.com"`

Meanwhile the Supabase auth flow defaults its OAuth redirect origin to **www**
(`supabaseAuth.ts`: `VITE_AUTH_REDIRECT_ORIGIN ?? "https://www.myfenrir.com"`),
so www must work regardless.

Pick ONE canonical host and make everything agree:

- **Option A — canonical = www (matches this Worker).** Keep apex→www here, and
  update the marketing canonical to www: `index.html` canonical + `og:url` →
  `https://www.myfenrir.com/`, and `PUBLIC_SITE_URL` → `https://www.myfenrir.com`.
- **Option B — canonical = apex (matches the repo today).** Flip the Worker to
  redirect **www → apex** instead — change the hostname test to:
  `if (url.hostname === "www.myfenrir.com") { url.hostname = "myfenrir.com"; ... }`
  Leave the marketing tags as-is. (Note: confirm the Supabase auth origin still
  points at a host that serves the app.)

Do not ship apex→www while the canonical tag still says apex — that is a
self-conflicting signal for crawlers.

## ⚠️ Pre-activation checklist (prevents taking the site down)
1. Confirm which hostname the Pages project (`fenrir-bridge`) actually serves as
   its custom domain(s). If Pages serves **apex only** and you redirect apex→www,
   then `www.myfenrir.com` MUST already resolve to the same Pages origin — verify
   the www custom domain / DNS record exists in Cloudflare **before** deploying.
   If www is NOT wired to Pages, do **not** deploy apex→www; deploy a HTTPS-only
   variant instead (see below) and tell Francisco.
2. Decide Force-HTTPS ownership. "Always Use HTTPS" is a zero-cost dashboard
   toggle (SSL/TLS → Edge Certificates → Always Use HTTPS). Francisco's hybrid
   recommendation: enable that toggle and let the Worker do ONLY the apex↔www
   hop (delete the `http:` block here). Either is fine — just don't rely on both
   silently; pick one and note it.

## Deploy (from an authenticated machine — wrangler OAuth, no API token)
```bash
cd apps/fenrir-bridge/workers/fenrir-redirects
# one-time: interactive browser login (OAuth, no API key)
env -u CLOUDFLARE_API_TOKEN npx wrangler@4 login
env -u CLOUDFLARE_API_TOKEN npx wrangler@4 deploy
```

## Verify LIVE immediately after deploy
```bash
curl -sSI http://myfenrir.com/       # expect 301 -> https://... (Location preserved)
curl -sSI https://myfenrir.com/      # expect 301 -> https://www.myfenrir.com/ (if apex->www chosen)
curl -sSI https://www.myfenrir.com/  # expect 200 and the site loads on the canonical host
curl -sSI 'https://myfenrir.com/wiki?x=1'  # expect path+query preserved on the redirect
```
The site must still load on the canonical host and API routes (`/api/*`) must
still return their normal responses (passthrough intact).

## Rollback
If anything breaks: delete the routes / delete the Worker in the dashboard
(Workers & Pages → fenrir-redirects), or:
```bash
env -u CLOUDFLARE_API_TOKEN npx wrangler@4 delete --name fenrir-redirects
```
Removing the Worker restores direct Pages serving on both hostnames.
