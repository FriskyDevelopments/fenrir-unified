# Fenrir login — root cause and fix (handoff)

Status: **diagnosed and staged; one external step remains that this environment
cannot perform** (it lives inside the Vercel `myfenrir-login` app or behind a
Cloudflare token). Everything below was proven with live CI probes
(`apps/fenrir-bridge/scripts/diagnose-login.sh`, `probe-login-app.sh`,
`probe-redirects.sh`), not assumed.

## What actually breaks login

Users go: `www.myfenrir.com` (Vercel) → login → `login.myfenrir.com` (Vercel
`myfenrir-login`). Its `initiateLogin` server action sends WorkOS:

```
client_id    = client_replace_me                 ← hardcoded placeholder
redirect_uri = http://localhost:3000/auth/callback ← placeholder
```

WorkOS therefore returns **"Invalid client ID."** That is the entire bug.

## What is already correct (do NOT change)

- Your real client id **`client_01KT7NWYWB256XP0V00PX1YW01`** is valid — WorkOS
  renders AuthKit for it.
- `https://login.myfenrir.com/auth/callback` is **already a registered redirect
  URI** in WorkOS (so no dashboard redirect change is needed).
- The Cloudflare app `auth.myfenrir.com` (fenrir-bridge) is a *separate*, working
  WorkOS integration and is **not** in the user path.

## The fix (in the `myfenrir-login` Vercel app — ~2 minutes)

The values are hardcoded in that app's source (which is why a prior
"redeploy after env vars set" did not change the output). In `myfenrir-login`:

1. Replace `client_replace_me` → `client_01KT7NWYWB256XP0V00PX1YW01`
2. Replace `http://localhost:3000/auth/callback` →
   `https://login.myfenrir.com/auth/callback`
3. Ensure `WORKOS_API_KEY` (matching that WorkOS environment) is set in the
   project's **Production** environment.
4. Redeploy.

If the app reads these from env instead of hardcoding, set `WORKOS_CLIENT_ID`,
`WORKOS_REDIRECT_URI`, and `WORKOS_API_KEY` to the same values and redeploy.
`apps/fenrir-bridge/scripts/fix-vercel-login.sh` does this via the Vercel CLI.

## Alternative (let me finish it autonomously)

Add a fresh **`CLOUDFLARE_API_TOKEN`** (Pages:Edit, account
`e2a7eccb24c4836847fd14d08c499bd0`) to GitLab → Settings → CI/CD → Variables.
Then I will: point fenrir-bridge's redirect at `auth.myfenrir.com` (already a
working, API-key-holding callback) and deploy a forwarder onto
`login.myfenrir.com` via the Vercel MCP — no secrets exposed.

## Verify (no credentials needed)

Re-run the GitLab **`diagnose-login`** CI job. Login is fixed when the
`x-action-redirect` from `login.myfenrir.com` shows
`client_id=client_01KT7NWYWB256XP0V00PX1YW01` (not `client_replace_me`) and the
AuthKit screen renders.

## Why this could not be completed here

Completing it requires `WORKOS_API_KEY` in the Vercel runtime (no env tooling /
Vercel API is reachable from this sandbox; the key is a masked secret I will not
extract) **or** a valid Cloudflare token (the CI one is expired and none exists
in repo/disk/env). Both are credentials held only by your accounts.
