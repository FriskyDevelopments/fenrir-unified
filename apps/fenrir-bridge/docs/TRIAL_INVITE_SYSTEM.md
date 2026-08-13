# MyFenrir Trial + Invite-Code System — Integration Handoff

**Branch:** `feat/trial-invite-system` (uncommitted, for review — nothing pushed)
**App:** `apps/fenrir-bridge` (Cloudflare **Pages** + Pages Functions)
**Data plane:** Cloudflare **D1** (binding `DB`, database `fenrir-bridge`) — same DB as billing
**Payments:** Stripe (reuses the existing `functions/_lib/stripe.ts`)
**Auth:** existing signed session cookie (`functions/_lib/auth.ts`, Supabase-backed)

---

## 1. Where the "generated" system was

A filesystem search of the Mac (`/Users/friskypup`, which covers `~`, `~/Downloads`,
`~/fenrir-unified`, …) found **no `myfenrir-trial-system` directory** — it only ever
existed inside the other tool's sandbox (`/workspace/...`), which is not on this
machine. Per the brief, the concept was therefore **rebuilt directly in
`~/fenrir-unified`**, adapted to MyFenrir's real stack rather than porting the
Express/Mongo shape.

## 2. How it was adapted to the real stack

The original design was an Express server with its own DB. MyFenrir doesn't run
Express — `fenrir-bridge` is a Cloudflare Pages project whose backend is **Pages
Functions** under `functions/`, with billing state in **D1** and Stripe already
wired. So the trial system was built the MyFenrir way:

| Design concept | MyFenrir implementation |
| --- | --- |
| Express routes | Cloudflare Pages Functions under `functions/api/trial/` |
| New DB (Mongo) | **D1** tables in the existing `DB` binding (alongside `billing_*`) |
| Stripe client | reuse `functions/_lib/stripe.ts` → `getStripe(env)` |
| Stripe customer | reuse `billing_customers` + `getCustomer`/`upsertCustomer` (so a trial's Customer is the *same* one used at conversion) |
| Identify the user | reuse `readSession()` → `frisky_user_id` / `frisky_org_id` (the keys billing already uses) |
| SetupIntent (card, no charge) | Stripe SetupIntent; **card is captured client-side by Stripe.js and never touches the Worker** — only IDs are stored |

Naming note: the design's `invite_codes` table is named **`trial_invite_codes`** to
avoid colliding with the two pre-existing "code" systems in the repo (Community
Gate membership invites in Neon via `consume_invite_code`, and `billing_courtesy_codes`
in D1). The column contract from the brief is preserved.

## 3. Database schema (D1)

File: **`docs/trial-invite-schema.sql`**. Apply it to the same D1 as the Stripe schema:

```bash
# from apps/fenrir-bridge
wrangler d1 execute fenrir-bridge --file=docs/trial-invite-schema.sql            # local
wrangler d1 execute fenrir-bridge --remote --file=docs/trial-invite-schema.sql   # production
```

`trial_invite_codes` — `code` (PK), `require_card` (0/1), `duration_days`,
`max_uses`, `used_count`, `plan?`, `note?`, `status` (`active|disabled`),
`created_by`, `created_at`, `updated_at`, `expires_at?`.

`trials` — `id` (uuid PK), `frisky_org_id`, `frisky_user_id` (the design's
`user_id`), `user_email?`, `code`, `status`
(`pending_card|active|converted|expired|canceled`), `card_on_file` (0/1),
`stripe_customer_id?`, `stripe_setup_intent_id?`, `plan?`, `started_at?`,
`ends_at?`, timestamps, `UNIQUE(frisky_org_id, code)`. **Only Stripe object IDs
are stored — never card data.**

## 4. Endpoints (Pages Functions)

| Method + path | Auth | Purpose |
| --- | --- | --- |
| `POST /api/trial/admin/codes` | platform admin | Create an invite code (`{ requireCard, durationDays, maxUses?, plan?, note?, expiresAt?, code? }`) |
| `GET /api/trial/admin/codes` | platform admin | List recent codes with usage |
| `POST /api/trial/redeem` | member session | Use a code. `requireCard:false` → trial starts now; `true` → creates a `pending_card` trial |
| `POST /api/trial/setup-intent` | member session | Returns Stripe `clientSecret` for the card-required trial |
| `POST /api/trial/verify` | member session | Confirms the SetupIntent succeeded → starts the trial |
| `GET /api/trial/status` | member session | Current trial state (`status`, `cardOnFile`, `endsAt`, `daysRemaining`) |
| `POST /api/trial/convert` | member session | Convert an active card-backed trial into a paid subscription |

All responses use the repo's `noStoreJson` shape (`{ ok, ... }`).

**Admin authorization** reuses the existing `SUPABASE_ADMIN_EMAILS` allowlist
(the session's email must be listed). If that var is unset, admin endpoints return
`admin_not_configured` (503) rather than allowing anyone.

### Flows

- **No-card code** → `redeem` atomically consumes one use and starts the trial
  (`status=active`, `card_on_file=0`, `ends_at = now + duration_days`).
- **Card code** → `redeem` creates a `pending_card` trial (no use consumed yet) →
  `setup-intent` returns a `clientSecret` → the browser confirms the card with
  Stripe.js → `verify` checks `setupIntent.status === "succeeded"`, sets it as the
  customer's default payment method, **consumes one use**, and activates the trial.
  A code use is only spent once the card is actually confirmed, so abandoned card
  flows don't burn codes. `stripe/webhook.ts` also handles `setup_intent.succeeded`
  as an idempotent backstop.

## 5. Stripe secret & webhook wiring (⚠️ action required)

The code reads the Stripe key **only** from the env binding
(`env.STRIPE_SECRET_KEY` via `getStripe`); nothing is hardcoded and nothing is in
git. Current status on this machine:

- `STRIPE_SECRET_KEY` — **absent** from `.dev.vars` and `.env.local` (confirmed).
- `STRIPE_WEBHOOK_SECRET` — **absent**.
- `NEON_DATABASE_URL` — present (community gate already works).

This matches `docs/MYFENRIR_ALPHA_LAUNCH_GATE.md` (Stripe is standby/optional). The
wiring is complete; it activates the moment the key is present. To enable:

**1Password → Cloudflare Pages** (the repo's existing path, `scripts/sync-alpha-secrets.sh`,
`OP_VAULT=Private`, `OP_ITEM="Fenrir Alpha Secrets"`):

| Secret | `op://` reference | Where it binds |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | `op://Private/Fenrir Alpha Secrets/STRIPE_SECRET_KEY` | fenrir-bridge Pages env |
| `STRIPE_WEBHOOK_SECRET` | `op://Private/Fenrir Alpha Secrets/STRIPE_WEBHOOK_SECRET` | fenrir-bridge Pages env |

```bash
# push optional Stripe secrets from 1Password to Pages (they're already listed
# under OPTIONAL_SECRETS in the script):
bash scripts/sync-alpha-secrets.sh
# local dev intake (writes gitignored .env.local / .dev.vars):
npm run safe-box
```

For conversions you'll also want the existing price IDs
(`STRIPE_STARTER_PRICE_ID`, `STRIPE_PRO_PRICE_ID`, `STRIPE_OPERATOR_PRICE_ID`).

In the **Stripe dashboard**, add `setup_intent.succeeded` to the webhook that
already points at `POST /api/stripe/webhook` (the other billing events are already
handled there).

## 6. Front-end (remaining wiring)

Backend + a typed client are done: `trialService` in `src/services/api.ts`
(`status`, `redeem`, `createSetupIntent`, `verify`, `convert`). The remaining piece
is the Stripe.js card UI for card-required codes. Minimal shape:

```ts
import { loadStripe } from "@stripe/stripe-js";
import { trialService } from "@/services/api";

const stripe = await loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const r = await trialService.redeem(code);
if (r.requiresCard) {
  const { clientSecret } = await trialService.createSetupIntent(code);
  const elements = stripe.elements({ clientSecret });
  const paymentEl = elements.create("payment");
  paymentEl.mount("#card");
  // on submit:
  const { error } = await stripe.confirmSetup({ elements, redirect: "if_required" });
  if (!error) await trialService.verify(code); // → trial active
}
```

Add `VITE_STRIPE_PUBLISHABLE_KEY` (publishable key, safe to ship) to the Vite build
env; `@stripe/stripe-js` is not yet a dependency of this app.

## 7. Build / verification status

- `npm run typecheck` (repo's `tsc -p tsconfig.json`, covers `src`+`shared` incl. the
  new `trialService`/types): **PASS**.
- Strict type-check of the new Pages Functions (7 files) via a Cloudflare ambient
  shim: **PASS (0 errors)**.
- `functions/` is **not** type-checked by the repo's official pipeline (root
  `tsconfig` only includes `src`/`shared`) — Pages esbuild-bundles it at deploy.
  esbuild/`wrangler` couldn't be exercised in this environment (Mac-native binaries;
  no Cloudflare network), so the Pages bundle + a live Stripe **test-mode** run
  remain to be executed locally by Francisco once a test key is set.
- Pre-existing note: strict-checking `functions/api/stripe/webhook.ts` surfaces one
  latent typing at line 43 (`persistSubscriptionFromStripe`, `orgId` inference) in
  **existing** billing code that this branch did not modify. One-line fix if desired:
  `let orgId: string | null = sub.metadata?.frisky_org_id ?? orgFallback ?? null;`.

## 8. To-do before go-live

1. Apply `docs/trial-invite-schema.sql` to D1 (`--remote` for prod).
2. Set `STRIPE_SECRET_KEY` (+ `STRIPE_WEBHOOK_SECRET`, price IDs) from 1Password → Pages.
3. Add `setup_intent.succeeded` to the Stripe webhook.
4. Ensure `SUPABASE_ADMIN_EMAILS` is set so admins can mint codes.
5. Build the Stripe.js card step + `VITE_STRIPE_PUBLISHABLE_KEY`.
6. Run a Stripe **test-mode** end-to-end (non-card + card) before merging.

**Security invariants:** card data never reaches the Worker (Stripe.js + SetupIntent);
only Stripe IDs are persisted; no secrets are in code or git.
