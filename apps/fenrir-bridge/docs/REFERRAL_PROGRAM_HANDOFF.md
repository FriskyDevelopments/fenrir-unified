# MyFenrir Referral Program v1 — Handoff

Ties into the existing MyFenrir gate + Community Bridge + The Pack billing. Built on
the same rails as the courtesy-code system (crypto RNG, atomic claims, D1 truth,
`billing_subscriptions` access model). No existing referral code was replaced —
this is net-new.

## Reward rule — NEEDS FRANCISCO'S CONFIRMATION

- Default: **+30 days of The Pack access per PAID referral**, granted to the referrer.
- Configurable via worker var `REFERRAL_REWARD_DAYS` (int, 1–365; default 30). Change
  it in `wrangler.fenrir-stars.toml` `[vars]` or the dashboard — no code change.
- Rewards **stack**: each converted paid referral adds another window from the later
  of (now, current reward end).
- Reward is delivered by reusing the courtesy access rail: a `billing_subscriptions`
  row with id `referral:<referrer_telegram_id>` and an extending `current_period_end`.
  It never clobbers the referrer's own paid (`stars:`) or courtesy (`courtesy:`) access.

## What a member sees

- `/referral` or `/invite` (also the **🔗 REFER & EARN** button on the community panel):
  their personal link + stats (invited / converted / days earned / reward-through date).
- The link: `https://t.me/Myfenrir_bot?start=ref_<code>`.
- Member profile (`/profile`, MEMBER PROFILE button) now shows a compact referral line.

## Attribution

- **Bot / Stars rail (live):** `/start ref_<code>` records first-touch attribution
  (a `pending` row). On the buyer's Stars payment (`successful_payment`), the referral
  flips to `converted` and the referrer is rewarded — once.
- **Stripe / web rail (wired):** the worker rewards on `checkout.session.completed`
  when the session carries `metadata[ref_code]`. `handleFoundersCheckout` already
  forwards an optional `refCode` from the request body into that metadata.
  **Remaining plumbing:** Community Bridge's `/upgrade` flow must capture `?ref=<code>`
  from the gate URL and pass it as `refCode` to the founders-checkout call. Until then,
  the web rail is dormant (no double-reward risk) and Stars is the active rail.

## Anti-abuse (all enforced)

- Self-referral blocked (Telegram id and, on Stripe, org id).
- Dedupe by referred user — `UNIQUE(referred_id)`, first ref wins.
- Conversion counted once — guarded `UPDATE ... WHERE status='pending' RETURNING`;
  idempotent across webhook retries (Stars and Stripe both re-deliver).
- Reward on real PAID conversion only — never on clicks.
- Already-linked members are not attributed as "new users".
- Code creation rate-limit: `UNIQUE(referrer_id)` caps each referrer at exactly one code.

## Schema (applied to remote D1 `fenrir-bridge`)

`docs/referral-d1-schema.sql` — tables `referral_codes` (ref_code PK, referrer_id UNIQUE,
frisky_user_id, frisky_org_id, created_at) and `referrals` (referrer_id, referred_id
UNIQUE, ref_code, status pending|converted, reward_status none|granted, reward_days,
conversion_event, created_at, converted_at). Referral codes are stored in **plaintext**
(a shareable public token, unlike the HMAC-hashed single-use courtesy codes).

## Deploy

- D1 schema: **already applied to remote** (`1238059e-2638-4317-982e-e74dda046ccb`).
- Worker code: from an operator machine with wrangler OAuth:
  `cd apps/fenrir-bridge && npm run deploy:workers`
  (deploys fenrir-mcp-beta, fenrir-gate-router, and fenrir-stars-payments together).
- Also added `callback_query` to the self-healing `setWebhook` `allowed_updates` so the
  community panel buttons (including REFER & EARN) fire reliably.

## Verified

- `node --check` passes on the worker.
- Logic proven against local SQLite (attribution, self-block, dedupe, once-only
  conversion, idempotent + stacking reward, Stripe once-only).
- Live end-to-end test on the remote D1 (synthetic ids, then cleaned up): 1 invited →
  1 converted → +30 days, reward access active; repeat webhook did not double-reward.
