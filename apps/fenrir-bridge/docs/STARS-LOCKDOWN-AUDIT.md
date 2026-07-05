# Fenrir Stars Entitlement Lockdown — Prod Audit (2026-07-05)

Status: **AUDIT COMPLETE — DEPLOY STAGED, AWAITING OWNER** (auto-mode blocked prod deploy of a payment webhook; see Runbook).

## 1. Claims vs. reality

The task brief (relayed via Frisky Claw) asserted five components as "live & verified". Verified state:

| Claim | Reality |
|---|---|
| Webhook at `myfenrir.com/api/stars/webhook`, code in `fenrir-workers/src/routes/stars-webhook.ts` | **False.** Path is 404; neither `~/fenrir-workers` nor `~/fenrir-ops` exists. Real code: `apps/fenrir-bridge/workers/fenrir-stars-payments.js` (standalone worker, deployed 2026-06-06) and `apps/fenrir-bridge/functions/api/telegram/webhook.ts` (Pages Functions, newer — last fix 2026-06-23). |
| D1 tables `fenrir_users`, `fenrir_entitlements` | **False.** Real tables in D1 `fenrir-bridge` (`1238059e-2638-4317-982e-e74dda046ccb`): `telegram_stars_orders`, `telegram_stars_entitlements`, `telegram_account_link_codes`, `telegram_identity_links`, `app_users`, `billing_subscriptions`. |
| `/debug/user`, `/health/stars` "confirmed" via 200s | **Misleading.** myfenrir.com is a SPA; every path returns 200 + index.html. |
| `@FenrirPayBot` public and wired | **Partially true.** The Telegram username exists; whether it is the bot whose token sits in CF secrets is unverified (tokens live only in CF; diagnostics route added for this — see §3). |
| `STARS_WEBHOOK_SECRET` in worker secrets | Name is wrong; the real secret is `TELEGRAM_WEBHOOK_SECRET`, and it **is** configured on both the worker and the Pages project (both return proper 401s on bad/missing secret — verified live). |

## 2. Pipeline state (live D1, 2026-07-05)

- `telegram_stars_orders`: 2 rows, both user `746…933`, both **pending** (2026-05-11, 2026-06-04). No payment ever completed.
- `telegram_stars_entitlements`: **0 rows** — no entitlement has ever been activated.
- `telegram_account_link_codes`: **111 rows, all `pending`** (latest 2026-05-25) — the site has been issuing link codes but **no `/start link_…` has ever reached a bot**.
- `telegram_identity_links`: 0 rows.

## 3. Root causes found

1. **Telegram webhook target unknown/likely unset or wrong** — 111 unclaimed codes prove bot-side messages never arrive. (New `/api/admin/telegram/diagnostics` route surfaces `getMe` + `getWebhookInfo` after deploy.)
2. **Two competing webhook implementations.** A Workers route on the custom domain sends `myfenrir.com/api/telegram/webhook` to the **old standalone worker**, shadowing the newer Pages Function. Only the Pages version (`applyStarsEntitlementForTelegramUser`) bridges Stars → `billing_subscriptions` (`stars:<tgid>`, plan from `FENRIR_STARS_PLAN`, default `starter`) — i.e. only it can flip the SPA's "Subscription: Not connected". Only it runs `syncPendingStarsForFriskyUser` (pay-first-link-later reconciliation).
   → **Canonical webhook target: `https://fenrir-bridge.pages.dev/api/telegram/webhook`** (bypasses the shadow route; no routing changes needed).
3. **`FENRIR_TELEGRAM_BOT_USERNAME` missing on the worker** (`telegramStarsConfigured:false` in `/api/readiness`; `/api/telegram/stars` → 500). The Pages project may have it (its authed routes couldn't be probed unauthenticated).

## 4. Changes staged on branch `feat/stars-entitlement-lockdown`

All in `workers/fenrir-stars-payments.js` (syntax-checked, **not yet deployed**):

- **Hardened `markPaid`**: rejects foreign invoice payloads (non-`fenrir_stars:` prefix) and payer/order mismatches; logs anomalies; user gets a reconciliation message instead of a false "activated".
- **`GET /health/stars`**: public dashboard (JSON, `?format=html` for HTML) — orders/entitlements/link-codes by status, identity-link count, last 5 orders with masked Telegram IDs.
- **`GET /api/admin/telegram/diagnostics`**: per-channel `getMe` (bot id/username) + `getWebhookInfo` (url, pending count, last error). Read-only; never exposes tokens.
- **`POST /api/admin/telegram/sync-webhook`**: probes the target with the worker's own secret first (prevents pointing Telegram at an endpoint with a mismatched secret), then `setWebhook` with `secret_token` + `allowed_updates`. Without `FENRIR_ADMIN_TOKEN` set it is locked to the canonical Pages target and is a no-op when already correct (self-healing, abuse-proof). Set `FENRIR_ADMIN_TOKEN` (secret) to fully gate both admin routes.

## 5. Runbook — owner, ~10 minutes

```bash
cd ~/fenrir-unified/apps/fenrir-bridge

# 1. Deploy the patched worker
npx wrangler deploy -c wrangler.fenrir-stars.toml

# 2. Identify the bot + current webhook (public, read-only)
curl -s https://fenrir-stars-payments.hrgrrtks2p.workers.dev/api/admin/telegram/diagnostics | python3 -m json.tool
#    → confirms whether the CF token really is @FenrirPayBot and where the webhook points today

# 3. Point Telegram at the canonical Pages webhook (idempotent; probes secret-match first)
curl -s -X POST https://fenrir-stars-payments.hrgrrtks2p.workers.dev/api/admin/telegram/sync-webhook \
  -H "content-type: application/json" -d '{"channel":"prod"}' | python3 -m json.tool
#    If it returns target_probe_failed / probeStatus 401 → worker and Pages webhook secrets differ;
#    align TELEGRAM_WEBHOOK_SECRET on both, then retry.

# 4. (Recommended) lock the admin routes
openssl rand -hex 24 | npx wrangler secret put FENRIR_ADMIN_TOKEN -c wrangler.fenrir-stars.toml
#    Store the value in 1Password (FriskyDev-Infra).

# 5. Fix the username gap so /api/telegram/stars stops 500ing:
#    add FENRIR_TELEGRAM_BOT_USERNAME = "<username from step 2>" under [vars] in
#    wrangler.fenrir-stars.toml and redeploy; set the same var on the Pages project.

# 6. Live test (from your Telegram): open the bot → /subscribe → pay 1 invoice (250⭐ default;
#    set FENRIR_STARS_PRICE=1 on Pages env first if you want a 1-star test)
#    Then: curl -s https://fenrir-stars-payments.hrgrrtks2p.workers.dev/health/stars
#    Expect: orders.paid=1, entitlements.active=1 — and after /link-telegram, billing shows plan active.
```

## 6. Follow-ups (owner decisions)

- Remove the stale Workers route `myfenrir.com/api/telegram/webhook*` → old worker, so the domain path also reaches the Pages Function (today it's shadowed; harmless once Telegram targets pages.dev, but it's a trap).
- Decide the old worker's fate: keep as health/diagnostics surface (current role) or fold `/health/stars` into Pages Functions and retire it.
- The 111 pending link codes predate webhook wiring; they expire naturally, no cleanup needed.
