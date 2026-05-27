# MyFenrir Alpha Launch Gate

Verdict: CONDITIONAL GO for a non-Stripe launch.

MyFenrir is approved for private alpha and controlled beta. For this launch path, Stripe is explicitly out of scope: payment/access readiness is satisfied by Telegram Stars, D1 entitlement state, and the Telegram access-control checks below. Card billing can be added later without blocking go-live.

## Current Position

Use this positioning everywhere during alpha:

- Fenrir Bridge by Frisky
- Fenrir Bridge for Telegram Groups
- MyFenrir Access Gateway

Primary headline:

```text
Secure the front door to your Telegram group.
```

Primary subheadline:

```text
Fenrir Bridge protects private communities with identity checks, access gates, and admin-controlled entry flows.
```

Primary CTA:

```text
Request Alpha Access
```

Do not sell the product as a broad security platform yet. Keep the promise specific: Telegram access gates, admin-controlled entry, invite rotation, identity checks, and protected workspace sessions.

## Go / No-Go Table

| Area | Alpha status | Paid public status | Evidence needed |
| --- | --- | --- | --- |
| Domain live | GO | GO | `https://www.myfenrir.com` loads the current build |
| Brand clarity | GO | GO | Public copy uses `Fenrir Bridge by Frisky` or a related searchable phrase |
| SEO uniqueness | WATCH | WATCH | Search terms favor `Fenrir Bridge`, not plain `Fenrir` |
| Trust/legal pages | GO if visible | BLOCKER if absent | `/legal`, `/terms`, `/privacy`, `/acceptable-use` load publicly |
| Support path | GO if staffed | BLOCKER if unclear | Support email, Telegram support channel, or admin contact path is visible |
| Security explanation | GO if plain | BLOCKER if overclaimed | No fake or unexplained claims such as broad encryption promises |
| Payment readiness | TELEGRAM STARS ONLY | GO when tested | Telegram Stars invoice, webhook, D1 entitlement status, refund/support path, and plan gating verified |
| Telegram bot flow | CONTROLLED TEST | NO-GO until tested | Join request, identity check, approval/denial, admin override, and error fallback verified |

## Alpha Requirements

Before inviting early adopters:

- landing page has one primary CTA: `Request Alpha Access`, `Join Alpha`, or `Secure My Telegram Group`
- public legal pages are reachable
- security copy says what Fenrir actually does today
- support path exists and someone owns it
- Telegram group admin rules are documented in `docs/MYFENRIR_ADMIN_GUIDE.md`
- auth callback proof is current in `artifacts/auth-redirect-proof/`
- BugBug-style auth walkthrough is current in `artifacts/bugbug/auth-walkthrough/`

## Non-Stripe Go-Live Blockers

Do not run heavy promotion, lifetime deals, or broad paid public launch until all are true:

- Telegram Stars payment opens through the official Fenrir bot
- Telegram payment confirmation updates D1 entitlement state
- failed payment and refund/support behavior is documented
- Telegram join flow is tested end to end
- admin override is tested
- denial and ban paths are tested
- support contact gets a real response
- legal pages have counsel review or an explicit MVP legal approval
- security overview explains passkeys, OAuth, session cookies, provider data, and invite-link handling in plain language

## Stripe Position

Stripe is not a blocker for this go-live. Do not hold launch on `STRIPE_SECRET_KEY`, Stripe price IDs, the Stripe portal, or Stripe webhooks. Keep those as optional card-billing standby work after the Telegram Stars launch path is proven.

## Claim Discipline

Allowed alpha claims:

- passkey-ready sign-in
- federated identity through Google, Microsoft, and Apple
- protected workspace sessions
- admin-controlled access gates
- stable public links that route to private destinations
- Telegram invite rotation and revocation where implemented

Avoid unless backed by implementation and documentation:

- encrypted workspace sessions
- enterprise-grade security
- zero-trust
- fully automated moderation
- guaranteed fraud prevention
- guaranteed Telegram protection

## Admin Call

GO for:

- private alpha
- internal demos
- screenshots
- prompt gallery
- waitlist
- controlled Telegram community tests

NO-GO for:

- paid public launch
- heavy promo
- lifetime deals
- broad security claims
- public trust claims without support, legal, and access-control evidence
