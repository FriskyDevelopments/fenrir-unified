# Cursor Handoff: Stripe Integration for Fenrir Bridge

Repo:

```text
https://github.com/FriskyDevelopments/frisky-spark-lab
```

App path:

```text
apps/fenrir-bridge
```

Branch:

```text
main
```

## Mission

Implement the real Stripe billing backend for Fenrir Bridge without changing the current OAuth, legal, DNS, Telegram, or visual design work.

Current state:

- React/Vite app on Cloudflare Pages.
- Cloudflare Pages Functions exist under `functions/api`.
- OAuth backend exists for Google, Microsoft, Apple.
- UI already has pricing cards, account service panel, and a cashout pipeline.
- Stripe is currently placeholder UI only.

## Product Plans

Use these plans:

```text
free      $0      1 Telegram Lock, 1 Fenrir subdomain, no custom domain, no live rooms
starter   $3/mo   3 Telegram Locks, Fenrir subdomains, Live Rooms available
pro       $7/mo   10 Telegram Locks, custom domain support, Live Rooms
operator  $15/mo  unlimited locks, unlimited live rooms, multi-admin workflows, audit log
```

Use environment variables for Stripe Price IDs:

```sh
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_STARTER_PRICE_ID=
STRIPE_PRO_PRICE_ID=
STRIPE_OPERATOR_PRICE_ID=
```

## Required Backend Routes

Create Cloudflare Pages Functions:

```text
POST /api/billing/checkout
POST /api/billing/portal
POST /api/stripe/webhook
GET  /api/billing/status
```

Behavior:

- `POST /api/billing/checkout`
  - Requires authenticated session from existing `functions/_lib/auth.ts`.
  - Body: `{ "plan": "starter" | "pro" | "operator" }`
  - Creates Stripe Checkout Session in `subscription` mode.
  - Uses the matching `STRIPE_*_PRICE_ID`.
  - Sets `client_reference_id` to `frisky_org_id`.
  - Sets metadata:
    - `frisky_user_id`
    - `frisky_org_id`
    - `plan`
  - Returns `{ ok: true, url }`.

- `POST /api/billing/portal`
  - Requires authenticated session.
  - Creates Stripe Billing Portal session for the customer if available.
  - Returns `{ ok: true, url }`.

- `POST /api/stripe/webhook`
  - Verifies Stripe signature with `STRIPE_WEBHOOK_SECRET`.
  - Handles:
    - `checkout.session.completed`
    - `customer.subscription.created`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`
    - `invoice.payment_failed`
  - Updates billing entitlement state.

- `GET /api/billing/status`
  - Requires authenticated session.
  - Returns current plan, subscription status, customer ID, and plan limits.

## Storage Decision

For this pass, do not add a full Postgres migration.

Use the smallest Cloudflare-native storage shape that can work:

Preferred:

```text
D1 table for billing_customers and billing_subscriptions
```

Fallback if D1 binding is not ready:

```text
KV-like abstraction file with TODOs, but keep all API contracts real.
```

If adding D1, update `wrangler.jsonc` with a placeholder binding:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "fenrir-bridge",
    "database_id": "REPLACE_WITH_D1_DATABASE_ID"
  }
]
```

Add SQL migration doc:

```text
docs/stripe-d1-schema.sql
```

Tables:

```sql
billing_customers(
  frisky_org_id text primary key,
  frisky_user_id text not null,
  stripe_customer_id text not null,
  email text not null,
  created_at text not null,
  updated_at text not null
)

billing_subscriptions(
  stripe_subscription_id text primary key,
  frisky_org_id text not null,
  stripe_customer_id text not null,
  plan text not null,
  status text not null,
  current_period_end text,
  cancel_at_period_end integer default 0,
  created_at text not null,
  updated_at text not null
)
```

## Frontend Changes

Update:

```text
src/services/api.ts
src/App.tsx
src/i18n.ts
```

Requirements:

- Replace placeholder checkout click with `POST /api/billing/checkout`.
- Redirect browser to returned Stripe Checkout URL.
- Add Billing Portal button if billing status has a customer/subscription.
- Show plan status from `/api/billing/status`.
- Keep Spanish-first UX.
- Do not make a landing page.
- Keep current premium dark Fenrir UI.

## Security

- Never expose `STRIPE_SECRET_KEY` in frontend.
- Webhook must verify signature before processing.
- Checkout and portal routes must require the existing HttpOnly session.
- Use plan allowlist only: `starter`, `pro`, `operator`.
- Do not trust plan or price ID from frontend beyond the plan key.

## Acceptance Checks

Run:

```sh
npm run build
npx wrangler pages dev dist --ip 127.0.0.1 --port 8788
```

Manual endpoint checks:

```sh
curl -i http://127.0.0.1:8788/api/billing/status
curl -i -X POST http://127.0.0.1:8788/api/billing/checkout \
  -H 'content-type: application/json' \
  -d '{"plan":"starter"}'
```

Expected without auth:

```text
401 authentication_required
```

Expected with auth and env configured:

```text
checkout returns Stripe-hosted URL
webhook verifies Stripe signature
billing status returns current plan and limits
```

## Do Not Touch

- Do not rewrite the visual system.
- Do not remove AI Studio.
- Do not deploy to production unless secrets are configured.
- Do not touch `scripts/check-structure.mjs`; it is currently a separate dirty local change.
- Do not replace Google/Microsoft/Apple OAuth.

## Cursor Prompt

```text
You are working in:
https://github.com/FriskyDevelopments/frisky-spark-lab

Target app:
apps/fenrir-bridge

Implement real Stripe billing for Fenrir Bridge using Cloudflare Pages Functions.

Use the existing OAuth session helpers in functions/_lib/auth.ts.
Do not change OAuth, DNS, Telegram, legal pages, or the visual design.

Build:
- POST /api/billing/checkout
- POST /api/billing/portal
- POST /api/stripe/webhook
- GET /api/billing/status

Use Stripe Checkout subscriptions with env price IDs:
- STRIPE_STARTER_PRICE_ID
- STRIPE_PRO_PRICE_ID
- STRIPE_OPERATOR_PRICE_ID

Use Spanish-first UI.
Update src/services/api.ts and App.tsx so pricing buttons call the backend and redirect to Stripe.
Add a billing status display and portal button.
Add docs/stripe-d1-schema.sql if using D1.

Security:
- Verify webhook signatures.
- Require authenticated session for checkout, portal, and billing status.
- Never expose Stripe secret key to frontend.
- Allow only starter/pro/operator plan keys.

Run npm run build and wrangler pages dev to verify.
```
