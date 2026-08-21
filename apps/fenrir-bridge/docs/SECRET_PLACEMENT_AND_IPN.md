# MyFenrir — Secret Placement & NOWPayments IPN (close-out)

Account: Cloudflare `e2a7eccb24c4836847fd14d08c499bd0`. Never paste secret values into git, logs, or chat.

## Exact placement (WHAT goes WHERE)

### Worker `fenrir-stars-payments`  (crypto checkout + IPN — `workers/fenrir-stars-payments.js`)
The charge happens here, so the NOWPayments secrets MUST live on this worker:

- `NOWPAYMENTS_API_KEY` — **MISSING here.** Required by `handleFoundersNowPaymentsCheckout` (`x-api-key`). It is currently set on **Pages** instead, where **nothing reads it** (verified: no `functions/**` reference). Set it on this worker and then delete it from Pages.
- `NOWPAYMENTS_IPN_SECRET` — **MISSING here.** Required by `verifyNowPaymentsIpn` (validates the `x-nowpayments-sig` HMAC). Must equal the IPN secret from the NOWPayments dashboard.

Set them (values NOT available headless — see below), from a neutral dir:
```
printf '%s' "<value>" | wrangler secret put NOWPAYMENTS_API_KEY   -c apps/fenrir-bridge/wrangler.fenrir-stars.toml
printf '%s' "<value>" | wrangler secret put NOWPAYMENTS_IPN_SECRET -c apps/fenrir-bridge/wrangler.fenrir-stars.toml
```

### Pages `fenrir-bridge`  (Stripe card checkout + admin courtesy — `functions/api/billing/*`)
- `FENRIR_COURTESY_CODE` — **MISSING.** One-use admin courtesy code (validated in `checkout.ts`).
- `STRIPE_COURTESY_COUPON_ID` — **MISSING.** Stripe 100%/6‑month coupon id (a coupon id is not a Stripe secret key).
- `STRIPE_STARTER_PRICE_ID`, `STRIPE_PRO_PRICE_ID`, `STRIPE_OPERATOR_PRICE_ID` — **MISSING.** Needed by `priceIdForPaidPlan`.
- `STRIPE_SECRET_KEY` — **MISSING on Pages** (needed by `getStripe` in `checkout.ts`). Today it exists only on the stars worker. DECISION NEEDED: either add it to Pages, or route card checkout through the stars worker. Without it, `POST /api/billing/checkout` returns `billing_misconfigured`.
- `STRIPE_WEBHOOK_SECRET` — **MISSING on Pages** (needed only if Pages handles Stripe webhooks).
- `FENRIR_GATEKEEPER_INTERNAL_SECRET` — present and **freshly synced** with the gatekeeper worker (this close-out).

Set (production env) with:
```
printf '%s' "<value>" | wrangler pages secret put FENRIR_COURTESY_CODE       --project-name fenrir-bridge
printf '%s' "<value>" | wrangler pages secret put STRIPE_COURTESY_COUPON_ID  --project-name fenrir-bridge
printf '%s' "<value>" | wrangler pages secret put STRIPE_STARTER_PRICE_ID    --project-name fenrir-bridge
printf '%s' "<value>" | wrangler pages secret put STRIPE_PRO_PRICE_ID        --project-name fenrir-bridge
printf '%s' "<value>" | wrangler pages secret put STRIPE_OPERATOR_PRICE_ID   --project-name fenrir-bridge
# and STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET if card checkout stays on Pages
```
> ⚠️ Cloudflare **Pages binds secrets at deploy time** — after `wrangler pages secret put` you MUST redeploy Pages for the live Functions to see the new value. (This was a real cause of the persistent 401s.)

## NOWPayments IPN callback
The invoice already sets, per‑invoice:
`ipn_callback_url = https://fenrir-stars-payments.hrgrrtks2p.workers.dev/api/nowpayments/ipn` — correct, no code change needed.
Dashboard step: NOWPayments → **Store Settings → Instant Payment Notifications** → set the IPN secret, and (optional) set the global IPN callback URL to the same endpoint. Copy that IPN secret into `NOWPAYMENTS_IPN_SECRET` on the stars worker so `verifyNowPaymentsIpn` accepts callbacks.

## Secrets NOT available headless — STOPPED, not fabricated
A full scan of the readable 1Password vaults (`frisky`, `FriskyDev-Infra`, service-account `OP_SERVICE_ACCOUNT_TOKEN`) found **none** of the following. They must be supplied by Francisco / the NOWPayments & Stripe dashboards. No placeholder/fake values were written and no code was left in a "consume-then-fail" state:

- `NOWPAYMENTS_API_KEY`  (stars worker) — value only exists encrypted on Pages (unreadable) and in NOWPayments dashboard
- `NOWPAYMENTS_IPN_SECRET`  (stars worker) — NOWPayments dashboard
- `FENRIR_COURTESY_CODE`  (Pages)
- `STRIPE_COURTESY_COUPON_ID`  (Pages)
- `STRIPE_STARTER_PRICE_ID` / `STRIPE_PRO_PRICE_ID` / `STRIPE_OPERATOR_PRICE_ID`  (Pages)
- `STRIPE_SECRET_KEY` (Pages, if card checkout stays there) / `STRIPE_WEBHOOK_SECRET` (Pages)

(1Password "Fenrir Community" holds only the two bot tokens; STIX/ClipsFlow items hold *their own* Stripe/IPN values, which are NOT MyFenrir's.)
