# Wert.io card payments — Fenrir / MyFenrir integration

Adds **Wert.io** (card → crypto on-ramp) as an additional way to pay for a Fenrir
paid plan, beside Telegram Stars and the Stripe scaffolding. Same entitlement:
a successful card payment grants `billing_subscriptions` through the exact
`upsertSubscription()` writer the Stars and Stripe paths already use.

**Gated dark.** The card button is a "coming soon" placeholder until
`WERT_PARTNER_ID` + `WERT_RECEIVING_WALLET` are configured. No real payment path
is enabled by this branch. No prod cutover.

## Flow

```
SPA pricing grid → "Pay with card" (per plan)
   → POST /api/billing/wert-checkout   (session-auth'd; server sets price + click_id)
   → open @wert-io/widget-initializer widget with the returned options
   → user pays by card, Wert settles USDC to WERT_RECEIVING_WALLET
   → Wert calls POST /api/wert/webhook  (HMAC-verified)
   → upsertSubscription(db, { stripe_subscription_id: "wert:<orgId>", plan, status:"active" })
   → org's effectiveBillingPlan reflects the paid plan
```

The payment is bound to the workspace via the widget `click_id`
(`fenrir:<plan>:<orgId>:<userId>`), set server-side from the session — the client
never picks its own price or org. The webhook re-derives the expected USD price
for the decoded plan and refuses a short payment (defends a tampered click_id).

## Files committed on this branch (self-contained, verified)

| File | What |
|---|---|
| `functions/_lib/wert.ts` | gating, widget-option builder, click_id codec, Web-Crypto HMAC webhook verify |
| `functions/api/billing/wert-checkout.ts` | POST, session-auth'd, returns widget options or `enabled:false` |
| `functions/api/wert/webhook.ts` | POST, HMAC-verify → amount check → `upsertSubscription` grant |
| `functions/__tests__/wert.test.ts` | 15 vitest cases (lib units + webhook grant/dedup/badsig/amount-mismatch) |
| `.env.example` | documents the `WERT_*` names (values blank; Secret Center is source of truth) |

Verified on this branch: `tsc --noEmit` clean · `vite build` OK · `vitest run` 49/49
(15 new Wert cases).

## Edits that must be re-applied to the WIP-carrying files

`src/App.tsx`, `src/i18n.ts`, `src/services/api.ts`, `functions/_lib/plan-catalog.ts`,
`functions/_lib/billing-env.ts`, and `package.json` all carried large **pre-existing
uncommitted `feat/stars-entitlement-lockdown` work** when this integration was
written. To avoid bundling ~5k lines of unrelated WIP into the Wert commit, the
edits below were applied in the working tree and verified, but **left unstaged**.
Re-apply them when the stars-lockdown WIP is reconciled/committed.

### 1. `functions/_lib/billing-env.ts` — add to the `BillingEnv` type

```ts
  WERT_PARTNER_ID?: string;
  WERT_WEBHOOK_SECRET?: string;
  WERT_RECEIVING_WALLET?: string;
  WERT_ORIGIN?: string;       // https://widget.wert.io | https://sandbox.wert.io
  WERT_COMMODITY?: string;    // default USDC
  WERT_NETWORK?: string;      // default polygon
  WERT_STARTER_USD?: string;  // optional price overrides
  WERT_PRO_USD?: string;
  WERT_OPERATOR_USD?: string;
```

### 2. `functions/_lib/plan-catalog.ts` — add the USD price map

```ts
export function usdPriceForPaidPlan(env: BillingEnv, plan: PaidPlanKey): number {
  const parse = (raw: string | undefined, fallback: number): number => {
    const n = Number.parseFloat((raw ?? '').trim());
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  if (plan === 'starter') return parse(env.WERT_STARTER_USD, 3);
  if (plan === 'pro') return parse(env.WERT_PRO_USD, 7);
  return parse(env.WERT_OPERATOR_USD, 15);
}
```

### 3. `package.json` — add the dependency

```json
"@wert-io/widget-initializer": "^7.0.5"
```

### 4. `src/services/api.ts` — add to `billingService`

```ts
async wertCheckout(plan: PaidPlan): Promise<{
  ok: true; enabled: boolean; plan?: PaidPlan; amountUsd?: number;
  sandbox?: boolean; wert?: Record<string, unknown>;
}> {
  return apiRequest('/api/billing/wert-checkout', {
    method: 'POST', body: JSON.stringify({ plan }),
  });
},
```

### 5. `src/App.tsx` — add the handler (next to `startTelegramStars`)

```ts
async function startWertCheckout(planLabel: string) {
  const key = paidPlanFromProductLabel(planLabel);
  if (!key) { setNotice(copy[locale].billingPaidPlanOnly); return; }
  setCheckoutPlan(key);
  navigateActive('billing');
  try {
    const res = await billingService.wertCheckout(key);
    if (!res.enabled || !res.wert) { setNotice(copy[locale].cardComingSoon); return; }
    const mod = await import('@wert-io/widget-initializer');
    const WertWidget = (mod.default ?? mod) as unknown as new (
      options: Record<string, unknown>
    ) => { open: () => void };
    new WertWidget({
      ...res.wert,
      listeners: {
        'payment-status': (data: { status?: string }) => {
          if (data?.status === 'success') setNotice(copy[locale].cardPaid);
          else if (data?.status === 'failed') setNotice(copy[locale].cardFailed);
        },
      },
    }).open();
    if (res.sandbox) setNotice(copy[locale].cardSandbox);
  } catch { setNotice(copy[locale].checkoutErrorGeneric); }
}
```

And the button in the pricing grid (beside the Stars button):

```tsx
{plan !== 'Free' ? (
  <>
    <button onClick={() => void startTelegramStars()}>{c.starsCheckout}</button>
    <button className="secondary" onClick={() => void startWertCheckout(plan)}>
      {c.payWithCard}
    </button>
  </>
) : null}
```

### 6. `src/i18n.ts` — add these keys to **every** locale (en/es/fr/de)

```
payWithCard, cardComingSoon, cardPaid, cardFailed, cardSandbox
```
(English values: "Pay with card" / "Card payments are coming soon — Telegram
Stars works today." / "💳 Payment received — your plan unlocks automatically." /
"Card payment failed — nothing was charged." / "🧪 Test checkout (sandbox) — no
real charge.")

## Operator go-live (Wert KYB — wert.io/for-partners)

1. Sandbox + prod `partner_id` (issued after KYB).
2. `WERT_WEBHOOK_SECRET`; register webhook `https://www.myfenrir.com/api/wert/webhook`.
   ⚠ Confirm Wert's real signature header at onboarding — the code expects
   `X-Wert-Signature`, hex HMAC-SHA256 over the raw body.
3. `WERT_RECEIVING_WALLET` (USDC / polygon by default).
4. Whitelist the widget domain (`www.myfenrir.com`).
5. Set the secrets as Cloudflare Pages secrets (Secret Center is the source of
   truth), `WERT_ORIGIN=https://sandbox.wert.io` first → test a sandbox card →
   flip to `https://widget.wert.io`.
