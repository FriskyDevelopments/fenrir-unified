# myfenrir-login-worker

Self-contained **Cloudflare Worker** login for myfenrir.com — the Cloudflare
route (no Vercel). Fixes the proven bug where the old `login.myfenrir.com` app
sent WorkOS `client_id=client_replace_me`.

- `GET /` — login page (Apple / Google / Microsoft / AuthKit)
- `GET /api/auth/login?provider=…` — redirects to WorkOS with the **valid**
  client id and the **registered** redirect `https://login.myfenrir.com/auth/callback`
- `GET /auth/callback` — exchanges the code with `WORKOS_API_KEY`, sets a
  `.myfenrir.com` session cookie, redirects to `https://www.myfenrir.com/main`

## Deploy (Cloudflare)

```bash
cd myfenrir-login-worker
wrangler secret put WORKOS_API_KEY        # paste the sk_... for this WorkOS env
wrangler deploy                           # publishes to *.workers.dev
```

To serve `login.myfenrir.com` from this Worker, add a custom-domain route in
`wrangler.toml` (or the dashboard) once that hostname's DNS is on this Cloudflare
account, then redeploy. The WorkOS redirect `https://login.myfenrir.com/auth/callback`
is already registered.

`WORKOS_CLIENT_ID` and `WORKOS_REDIRECT_URI` are set in `wrangler.toml`;
only `WORKOS_API_KEY` is a secret.
