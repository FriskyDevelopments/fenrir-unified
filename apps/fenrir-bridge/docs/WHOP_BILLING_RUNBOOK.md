# Whop billing runbook (card standby, not the launch rail)

Status: code path ready for a controlled first sale. **Nothing here switches
charging on by itself** — a human deploys, applies the schema, and sets the
secrets. Telegram Stars stays the launch rail; Stripe is untouched.

## What this adds

- `POST /api/whop/checkout` — authenticated, sellable plans only
  (starter / pro / operator). Creates a Whop checkout configuration via
  `POST https://api.whop.com/api/v1/checkout_configurations` and returns its
  `purchase_url`. Metadata (`frisky_org_id`, `frisky_user_id`, `plan`,
  `email`) is inherited by the membership, which is how the webhook resolves
  the org. The Pack (`standard`) is deliberately NOT sellable here — it stays
  on the Stars rail.
- `POST /api/whop/webhook` — Whop v1 webhook receiver. Verifies the
  HMAC-SHA256 signature (`{webhook-id}.{webhook-timestamp}.{raw body}`,
  header `v1,<base64>`, 5-minute timestamp window), claims the webhook-id
  for idempotency, then:
  - `membership.activated` / `membership.updated` → upsert
    `billing_customers` + `billing_subscriptions` (Whop ids stored with a
    `whop:` prefix, so they never collide with Stripe ids). Active
    memberships never get a NULL `current_period_end` (falls back to
    now + `billing_period_days`, default 30).
  - `payment.succeeded` / `payment.failed` / `payment.requires_action` →
    acknowledged only. Never revoke on `payment.failed` alone — a failed
    renewal can still recover via 3DS, and `membership.updated` carries the
    real cancellation.
  - Unknown events → acknowledged, nothing granted.
- `WHOP_BILLING_ENABLED` — separate from `CARD_BILLING_ENABLED` (Stripe).
  Both default off. Enabling Whop never enables Stripe.

## Secrets the owner must provide (names only; Pages secrets, never git/chat)

- `WHOP_API_KEY` — Whop Dashboard → Developer → API Keys (company key).
- `WHOP_WEBHOOK_SECRET` — the `ws_...` signing secret shown once when the
  webhook is created (Dashboard → Developer → Webhooks).
- `WHOP_STARTER_PLAN_ID`, `WHOP_PRO_PLAN_ID`, `WHOP_OPERATOR_PLAN_ID` —
  the Whop plan (variant) ids, one per sellable plan.
- `WHOP_BILLING_ENABLED=true` — only after the steps below.

## Launch checklist (owner only — no deploy is done by this PR)

1. Review and merge this PR.
2. Apply the ledger: `wrangler d1 execute fenrir-bridge --file=docs/whop-d1-schema.sql`
   (billing_customers / billing_subscriptions already exist from
   docs/stripe-d1-schema.sql).
3. Deploy Pages `fenrir-bridge` from the approved commit
   (`npm run wrangler:check` must be green first).
4. In Whop, create the product + the three plans, then register the webhook:
   `https://myfenrir.com/api/whop/webhook`, events `membership.activated`,
   `membership.updated`, `payment.succeeded`, `payment.failed`. Set
   `WHOP_BILLING_ENABLED=true` only now.
5. Send a Whop dashboard test event, then a real test purchase: verify
   `/api/billing/status` shows the plan, `billing_subscriptions` has a
   `whop:mem_...` row with a real `current_period_end`, and cancelling in
   Whop flips the row to canceled (access drops on the next status read).
6. Refunds / disputes are handled in the Whop dashboard until a command
   exists here; do not promise an in-app refund flow yet.

## Known leftovers

- No Whop billing portal endpoint yet: customers manage/cancel in Whop
  (the `manage_url` on the membership), unlike the Stripe portal route.
- No courtesy-code support on the Whop checkout (Stripe checkout keeps it).
- Whop dashboard checkout links (no metadata) will hit
  `whop_membership_missing_org` and grant nothing — always sell through
  `/api/whop/checkout`, which attaches the org metadata.
