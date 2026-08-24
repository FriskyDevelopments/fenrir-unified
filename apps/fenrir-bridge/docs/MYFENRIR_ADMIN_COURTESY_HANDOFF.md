# MyFenrir Admin Courtesy Checkout — Handoff

## Objective

Provide other MyFenrir administrators with free courtesy access without presenting it as a purchase, paid plan, or paid subscription.

- Access type: Complimentary admin courtesy
- Access duration: 6 months
- Cost: Free
- Granted by: MyFenrir administration

Localized description:

- English: 6-month complimentary courtesy access for MyFenrir admins
- Español: Cortesía administrativa gratuita de 6 meses para administradores de MyFenrir
- Français: Accès de courtoisie administratif gratuit de 6 mois pour les administrateurs MyFenrir
- Deutsch: Kostenloser 6-monatiger Verwaltungszugang für MyFenrir-Administratoren

## Implemented flow

The checkout includes an optional one-use admin courtesy code. The server authenticates the user, validates the code against an encrypted Cloudflare secret, claims it atomically in D1, rejects reuse with courtesy_code_used, applies the configured Stripe coupon, and records these Checkout Session metadata fields:

    access_type=complimentary_admin_courtesy
    courtesy_duration=6_months

## Cloudflare state

- Pages project: fenrir-bridge
- Domains: myfenrir.com, www.myfenrir.com, auth.myfenrir.com, fenrir-bridge.pages.dev
- D1 binding: DB
- D1 database: fenrir-bridge
- Database ID: 1238059e-2638-4317-982e-e74dda046ccb
- Cloudflare account: e2a7eccb24c4836847fd14d08c499bd0

The remote D1 migration was applied successfully. It includes billing_courtesy_redemptions, keyed by the one-use code and recording the organization, user, and redemption time.

## Required encrypted secrets

Configure in the relevant environment of the fenrir-bridge Pages project:

- FENRIR_COURTESY_CODE: private one-use value entered by the administrator.
- STRIPE_COURTESY_COUPON_ID: ID of the Stripe coupon applied by the server.

These belong to the Pages Functions running functions/api/billing, not fenrir-gate-router or fenrir-stars-payments.

[Cloudflare environment variables](https://dash.cloudflare.com/e2a7eccb24c4836847fd14d08c499bd0/pages/view/fenrir-bridge/settings/environment-variables)

Never paste secret values into Git, documentation, logs, or chat.

## Stripe Test coupon

Start at [Stripe Test coupons](https://dashboard.stripe.com/test/coupons).

Recommended configuration:

- Name: MyFenrir Admin Complimentary Courtesy - 6 Months
- Discount: 100%
- Duration: 6 months
- Products: only the intended MyFenrir product/prices
- Redemption limit: 1 as an additional safeguard
- Metadata: access_type=complimentary_admin_courtesy, access_duration=6_months, cost=free, granted_by=MyFenrir administration

Store the resulting coupon ID in STRIPE_COURTESY_COUPON_ID. A coupon ID is not a Stripe secret API key.

## Test procedure

1. Confirm Stripe is in Test mode.
2. Create the 100%-off six-month coupon.
3. Save its ID and a strong one-use courtesy code as encrypted Cloudflare secrets in the test target environment.
4. Deploy the current build so Pages Functions receive the secrets.
5. Open MyFenrir checkout while authenticated and submit the courtesy code.
6. Confirm Stripe Checkout shows a zero total and complete it.
7. Confirm Stripe records the courtesy metadata.
8. Submit the same code again and confirm courtesy_code_used.
9. Verify the behavior after month six.

## Required policy decision

A Stripe subscription discounted to zero for six months can begin charging in month seven. Because this is described as free courtesy access, the recommended policy is to end access automatically after six months with no charge. Do not silently convert courtesy access into a paid renewal. Charging later requires explicit consent and clear advance disclosure.

## Transactional emails

Keep two separate flows:

- Standard welcome: send after Gate completion using real community, access, duration, expiration, entry-link, locale, and Wiki data. Do not send without a real email destination.
- Admin courtesy: explicitly state Complimentary admin courtesy, 6 months, Free, and Granted by MyFenrir administration. Never describe it as a purchase, paid plan, or paid subscription.

## Relevant files

- functions/api/billing/checkout.ts
- functions/_lib/billing-env.ts
- docs/stripe-d1-schema.sql
- src/services/api.ts
- src/App.tsx
- src/routes/dashboardPanels.tsx

## Verified

- TypeScript check passed.
- Production build passed.
- Remote D1 migration completed successfully.
- Secret values were not printed or committed.

## Remaining work

- Create the Stripe Test coupon.
- Configure both encrypted Cloudflare secrets.
- Deploy the implementation.
- Test first use and reuse rejection.
- Confirm automatic termination after month six.
- Implement or verify the dedicated courtesy transactional email.
