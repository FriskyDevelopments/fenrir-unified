# Stars launch runbook (The Pack, ⭐1,150 / 30 days)

Status: code path ready for a controlled first sale. **Nothing here switches charging on by itself** — a human deploys and sets the secrets.

## What this PR fixes
Telegram re-sends `successful_payment` every 30 days for a Stars subscription with the **same `invoice_payload`**, `is_recurring: true` and no `is_first_recurring`. The order is already `paid`, and the old validator required `pending`, so every renewal was rejected: Stars were charged, access was not extended and lapsed at day 30. The Pages webhook also wrote `current_period_end = NULL` (which the access check reads as "active forever").

- `workers/fenrir-stars-payments.js`: `isStarsRenewal`, `isValidStarsRenewal` (paid order, same user, XTR, amount equals the order's own amount, >= the ⭐250 floor — never compared with today's list price), `starsPaidThrough` (Telegram's `subscription_expiration_date` when sane, else +30 days, never NULL), `markRenewal` (idempotent per charge id). Renewals do not re-trigger referral rewards.
- `functions/api/telegram/webhook.ts` + `functions/_lib/stars-billing.ts`: same renewal rule; `current_period_end` is always a real date.
- Tests: `functions/__tests__/stars-renewal.test.ts`.

## Secrets the owner must provide (names only; set via `wrangler secret put` / Pages secrets, never in chat or git)
- `TELEGRAM_PROD_BOT_TOKEN` (BotFather, @Myfenrir_bot) — on the Pages project `fenrir-bridge` AND on the Worker `fenrir-stars-payments` (separate secret stores).
- `TELEGRAM_WEBHOOK_SECRET` — random value; same value passed as `secret_token` to `setWebhook`.
- Already expected: `SESSION_SECRET`, `NEON_DATABASE_URL`, `COMMUNITY_BRIDGE_BILLING_SECRET` (identical wherever it appears).

## Launch checklist
1. Review and merge this PR (owner).
2. Deploy Pages `fenrir-bridge` and Worker `fenrir-stars-payments` from the approved commit (`wrangler login`, then `npm run wrangler:check` must be green).
3. `setWebhook` to the chosen handler (Worker or Pages — only ONE) with `secret_token`; confirm with `getWebhookInfo`.
4. Real test: buy the Pack with a test account, verify `/status`, group access, and that D1 `billing_subscriptions.current_period_end` is a date ~30 days out. Renewal can only be observed at day 30; until then rely on the unit tests.
5. Payout: owner needs Telegram 2FA, a TON wallet and Fragment; min 1,000 Stars, 21-day hold; developer rate about $0.013 per Star (unverified third-party fee notes: Fragment ~5%).
6. Support contact visible; refunds are manual (`refundStarPayment`) until a command exists.

Known leftovers: `npm audit --audit-level=high` fails on `main` (needs a major wrangler/dev-deps upgrade); the Pages path still defaults the granted plan to `starter` unless `FENRIR_STARS_PLAN` is set.
