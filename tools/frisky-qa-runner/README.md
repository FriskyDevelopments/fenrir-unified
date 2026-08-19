# frisky-qa-runner

Playwright E2E for the **MyFenrir Quality → Community Bridge Quality** auth flow. Quality-only.

## What it checks
Per viewport (desktop 1440×900 + mobile 390×844):
1. **Landing** on `quality.myfenrir.com` — canonical Fenrir silhouette present, `#root` mounted, **not** a wrong `/docs` route.
2. **`/api/auth/me` (anon)** → expects `authenticated:false`.
3. **Authenticated legs** (only if the `QA_SUPABASE_ACCESS_TOKEN` secret is set):
   - establish session via `POST /api/auth/supabase-session`,
   - `/api/auth/me` → `authenticated:true`, callback stayed on the Quality host,
   - **handoff** to `communities-quality.myfenrir.com/gate` (records proxied `/api/auth/me`),
   - **sign-out** → `authenticated:false`.

Artifacts (screenshots, console, failed requests, exact route, verdict) go to the run's **dataset** + **key-value store** (`REPORT`, `OUTPUT`). Cookies/tokens are redacted.

## Safety
- Refuses to run against production hosts (`myfenrir.com`, `communities.myfenrir.com`, …).
- The test identity is read **only** from the Apify Secret env var `QA_SUPABASE_ACCESS_TOKEN` — never from input, code, or logs.
- No payments / invoices / destructive actions.

## Run on Apify (exact commands for Francisco)
```bash
# 1) one-time: authenticate the Apify CLI (interactive — needs your APIFY_TOKEN)
npx -y apify-cli login            # or: export APIFY_TOKEN=<your token>

# 2) store the quality-only test identity as a SECRET (never in input)
#    value = a short-lived Supabase access token for a QUALITY-ONLY account
npx -y apify-cli secrets:add QA_SUPABASE_ACCESS_TOKEN '<paste-quality-only-supabase-access-token>'

# 3) from this folder, push + run the actor
cd tools/frisky-qa-runner
npx -y apify-cli push
npx -y apify-cli call --input '{"baseUrl":"https://quality.myfenrir.com","communityUrl":"https://communities-quality.myfenrir.com"}' \
  --env QA_SUPABASE_ACCESS_TOKEN=@QA_SUPABASE_ACCESS_TOKEN
```

## Run locally (no Apify platform)
```bash
cd tools/frisky-qa-runner
npm install
QA_SUPABASE_ACCESS_TOKEN='<quality-only-token>' node main.js   # omit the env var for unauthenticated-only checks
# artifacts land in ./storage/key_value_stores/default and ./storage/datasets/default
```
