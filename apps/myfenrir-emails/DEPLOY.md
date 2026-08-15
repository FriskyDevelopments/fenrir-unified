# Deploy, domain & secrets

Cloudflare account: `e2a7eccb24c4836847fd14d08c499bd0`
Sender identity: **`noreply@mail.myfenrir.com`**. Cloudflare Email Sending is
enabled for that subdomain with its own SPF, DKIM and DMARC records. Replies go
to **`hola@myfenrir.com`**.

## Status snapshot

| Piece | Status |
|-------|--------|
| Worker `myfenrir-emails` code (providers, templates, brand) | ✅ in `apps/myfenrir-emails` |
| Pages client `functions/_lib/myfenrir-emails.ts` + magic-link wired | ✅ deployed in `fenrir-bridge` |
| `env.EMAIL` binding (Cloudflare Email Service) on the Worker | ✅ declared in `wrangler.toml` (`[[send_email]]`) |
| `mail.myfenrir.com` SPF + DKIM (`cf-bounce`) | ✅ confirmed with Wrangler |
| `mail.myfenrir.com` onboarded in **Email Service → Email Sending** | ✅ enabled 2026-08-08 |
| Secret `SEND_AUTH_TOKEN` (Worker + Pages token) | ✅ set and synchronized (values remain encrypted) |
| Custom Domain `emails.myfenrir.com` | ✅ Worker Custom Domain; DNS and TLS managed by Cloudflare |
| Secret `RESEND_API_KEY` (fallback) | 🔑 `op://FriskyDev-Infra/Email/password` |
| Secret `MAILERSEND_API_KEY` (fallback) | ⛔ **op:// path TBD** — leave unset until provided |
| Resend domain `myfenrir.com` | ⛔ not verified in Resend (only `hostcasa.app` is) |

## Secrets — never in git

Set via wrangler (OAuth session) or 1Password `op run`. Nothing is pasted into
files or this repo.

```bash
cd apps/myfenrir-emails
wrangler login                                   # OAuth in browser (no API token)

# Bearer that guards POST /send (generate a fresh one):
wrangler secret put SEND_AUTH_TOKEN              # paste: openssl rand -hex 32

# Fallback provider (only if you want the Resend rail live):
op read op://FriskyDev-Infra/Email/password | wrangler secret put RESEND_API_KEY

# MailerSend rail — op:// path not yet known; set when provided:
# wrangler secret put MAILERSEND_API_KEY
```

Then, on the **fenrir-bridge Pages** project, so Pages Functions reach this Worker:

```bash
# var (non-secret): the deployed Worker URL
#   MYFENRIR_EMAILS_URL = https://emails.myfenrir.com
# secret: must equal the Worker's SEND_AUTH_TOKEN
wrangler pages secret put MYFENRIR_EMAILS_TOKEN --project-name fenrir-bridge
```

## Step 1 — Confirm `mail.myfenrir.com` in Email Sending

The default rail (`provider=cloudflare`) uses the already-onboarded sending
subdomain and its Cloudflare-managed bounce/auth records.

1. Dashboard → **Compute → Email Service → Email Sending**
   (`https://dash.cloudflare.com/?to=/:account/email-service/sending`).
2. Confirm `mail.myfenrir.com` is listed as active.
3. CLI check: `wrangler email sending settings mail.myfenrir.com`.

> Before onboarding you can still test the Cloudflare path to **verified
> destination addresses only** (Email Routing → destination addresses). After
> onboarding, any recipient works. The Resend fallback works immediately from
> `hostcasa.app` regardless.

## Step 2 — Deploy (PREVIEW first, never blind prod)

```bash
cd apps/myfenrir-emails
npm install
npm run typecheck
wrangler deploy            # workers.dev preview URL (top-level env, workers_dev=true)
# -> https://myfenrir-emails.hrgrrtks2p.workers.dev

# smoke test the render path (no secret needed for previews):
curl -s https://emails.myfenrir.com/health | jq
open  https://emails.myfenrir.com/preview/acceso?brand=myfenrir
```

Send a real email through the Worker once secrets are set:

```bash
source .dev.vars   # for SEND_AUTH_TOKEN locally, or use the deployed secret
curl -s -X POST https://emails.myfenrir.com/send \
  -H "Authorization: Bearer $SEND_AUTH_TOKEN" -H "Content-Type: application/json" \
  -d '{"template":"verificacion-codigo","to":"babaji.alvarez@gmail.com",
       "brand":"myfenrir","data":{"nombre":"Francisco","codigo":"F7K2Q9","minutos":15}}'
# cloudflare rail expected once onboarded: { "ok": true, "provider": "cloudflare", "id": "..." }
# if not onboarded yet, it auto-falls back to resend (from hostcasa.app).
```

Deploy the production Worker and its managed Custom Domain:

```bash
wrangler deploy --env production    # emails.myfenrir.com (Custom Domain)
```

## Verified production baseline — 2026-08-14

- `GET /health`: HTTP 200, Cloudflare provider, live `EMAIL` binding, 8 templates.
- `GET /` and `/preview/bienvenida`: HTTP 200 over the branded Custom Domain.
- Unauthenticated `POST /send`: HTTP 401.
- Authenticated `bienvenida` send: accepted by Cloudflare Email Service and
  observed in an independent QA inbox with authenticated
  `noreply@mail.myfenrir.com`, matching subject, HTML, plain text, and CTA.
- Responsive browser QA: 1440 px desktop and 390 px mobile; no horizontal
  overflow in the studio or email card.

## Step 3 (optional) — Resend from @myfenrir.com

The Cloudflare default needs no Resend setup. If you also want the Resend rail to
send *as* `@myfenrir.com` (not just `hostcasa.app`), verify `myfenrir.com` in
Resend (Domains → Add) and add its DKIM/SPF CNAMEs to the `myfenrir.com` zone.

## Commands

```bash
npm run deploy              # preview (workers.dev)
npm run deploy:production   # route emails.myfenrir.com
wrangler secret put NAME    # rotate a secret
wrangler tail               # live logs
```
