# myfenrir-login-fix

A complete, working replacement for the `login.myfenrir.com` Vercel app, built
to fix the proven bug: the live app sends WorkOS the placeholder
`client_id=client_replace_me`, so WorkOS returns "Invalid client ID".

This app:
- sends the **valid** client id `client_01KT7NWYWB256XP0V00PX1YW01` (overridable
  via `WORKOS_CLIENT_ID`) and the **registered** redirect
  `https://login.myfenrir.com/auth/callback`,
- exchanges the code in `/auth/callback` using `WORKOS_API_KEY` from the project
  environment, sets a session cookie on `.myfenrir.com`, and bounces to
  `https://www.myfenrir.com/main`.

## Deploy (needs network to Vercel — runs on a GitLab CI runner or your machine)

This sandbox cannot reach Vercel (network policy blocks `vercel.com`), so deploy
one of these ways:

**A. GitLab CI (autonomous):** add `VERCEL_TOKEN` to GitLab → Settings → CI/CD →
Variables, then run the `deploy-login-app` job. It links to the `myfenrir-login`
project and deploys this app to production (`login.myfenrir.com`).

**B. Local:**
```bash
cd myfenrir-login-fix
vercel link --project myfenrir-login --scope pupfrs-projects
vercel deploy --prod
```

If the callback returns `?auth_error=workos_api_key_not_set`, set `WORKOS_API_KEY`
in the `myfenrir-login` project's Production env and redeploy.

## Verify
Re-run the GitLab `diagnose-login` job. Fixed when `login.myfenrir.com` sends
`client_id=client_01KT7NWYWB256XP0V00PX1YW01` (not `client_replace_me`).
