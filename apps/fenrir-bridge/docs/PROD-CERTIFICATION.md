# Fenrir Stars Payments — Production Certification

**Status: NOT CERTIFIED — code hardened & committed, prod deploy awaiting owner approval.**
Certification can only be issued after the runbook in `STARS-LOCKDOWN-AUDIT.md` §5 is executed
(deploy → webhook sync → one real Stars payment observed end-to-end).

Date: 2026-07-05
Branch: `feat/stars-entitlement-lockdown`
Commits: `1f32103ccb24009227e3a77e3220422349689913` (hardening), `0f57f5f73ef265bd95d9a5f7891c5c1fcd24e769` (audit doc)

## Verified live (2026-07-05, read-only probes)

| Check | Result |
|---|---|
| Worker deployed at `fenrir-stars-payments.hrgrrtks2p.workers.dev` | ✅ responds |
| `POST /api/telegram/webhook` without secret header | ✅ 401 (secret enforced on currently-deployed build) |
| Secrets present on worker | ✅ `TELEGRAM_BOT_TOKEN`, `TELEGRAM_DEV_BOT_TOKEN`, `TELEGRAM_PROD_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` |
| `/api/readiness` | ⚠️ `telegramStarsConfigured:false` (`FENRIR_TELEGRAM_BOT_USERNAME` missing) |
| D1 `fenrir-bridge` stars tables exist | ✅ (daily health-check snapshots; DDL in `docs/stripe-d1-schema.sql`) |
| Pipeline has completed a payment | ❌ never — 2 orders both `pending`, 0 entitlements, 111 unclaimed link codes |
| `/health/stars` live | ❌ not yet — ships with the staged deploy |

## Hardening in commit `1f32103c` (syntax-checked, not yet deployed)

1. **Fail-closed webhook secret** — request rejected (500/401) when `TELEGRAM_WEBHOOK_SECRET` is unset or mismatched; previously the check was skipped entirely when unset.
2. **`markPaid` full validation** — order must exist, payer must match the order, status must be `pending` (or an idempotent replay of the same charge id), currency must be `XTR`, amount must match. A forged or mismatched `successful_payment` can no longer insert an `active` entitlement. Anomalies are logged; the user reply no longer claims activation (or promises restoration) on a mismatch.
3. **MOD 03 subscribe-button payer fix** — callback-initiated invoices previously bound the order to the *bot's* user id (`query.message.from`), so pre-checkout rejected every real payer. Orders now bind to `query.from` (the human).
4. **`GET /health/stars`** — orders/entitlements/link-codes by status, identity-link count, last 5 orders (Telegram ids masked). JSON, `?format=html` for a dashboard.
5. **Admin routes** — `GET /api/admin/telegram/diagnostics` (getMe + getWebhookInfo, token never exposed) and `POST /api/admin/telegram/sync-webhook` (secret-match probe before `setWebhook`; allow-listed targets only).

## To certify (owner)

Run `STARS-LOCKDOWN-AUDIT.md` §5 (≈10 min): deploy, diagnostics, webhook sync to the canonical
Pages target, set `FENRIR_ADMIN_TOKEN`, set `FENRIR_TELEGRAM_BOT_USERNAME`, then complete one real
Stars payment and confirm `/health/stars` shows `orders.paid ≥ 1` and `entitlements.active ≥ 1`.
Then flip this file's status to CERTIFIED with the deploy's version id.
