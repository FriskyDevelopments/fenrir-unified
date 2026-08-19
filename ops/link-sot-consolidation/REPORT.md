# MyFenrir — link Source-of-Truth consolidation + Stripe anchor

**Date:** 2026-08-09 · **Repo:** `~/fenrir-unified` · **Scope:** one consolidation task
**Delivered:** on disk under `ops/link-sot-consolidation/` (isolated from the in-progress
`codex/fix-myfenrir-favicon` WIP), Supabase migration **validated live against the real
schema+data and rolled back** (zero prod residue). No secrets in this report or in git.

---

## 1. Canonical Supabase project (confirmed — yqev, not jgkt)

The MyFenrir app authenticates against **`yqevglppbhuoxxfsfnih` ("FriskyDEV", org
FriskyDevelopments)** — verified three ways:

- `apps/fenrir-bridge/.env` → `VITE_SUPABASE_URL=https://yqevglppbhuoxxfsfnih.supabase.co`; the server reads Supabase users via `SUPABASE_URL` in `functions/_lib/supabase.ts`.
- `apps/community-bridge/src/integrations/supabase/client.ts` **hard-defaults to the same** `yqevglppbhuoxxfsfnih`, calling it "la identidad canónica MyFenrir", and `shared-session.ts` shares one auth session across `*.myfenrir.com`.
- The Supabase MCP org token sees `yqev` (FriskyDEV) + `hostcasa`; it does **not** see `jgkt`.

**`jgktxeabubmkxkhlftkg` is a red herring:** it only appears in
`apps/community-bridge/supabase/config.toml` as the Supabase **CLI** target. The orphan
`telegram_link_codes` table + `redeem_telegram_link_code()` RPC were authored against
`jgkt` and **never applied to yqev** (confirmed: `to_regclass('public.telegram_link_codes')`
is `null` on yqev). That's *why* community-bridge's link tool silently no-ops today.

Because both apps share **yqev + one session**, the new SoT is directly RLS-readable by
community-bridge with no cross-project hop.

## 2. The split-brain, precisely (verified in code + data)

| Concern | Where it lived | Reality on 2026-08-09 |
|---|---|---|
| Deep-link generator | `functions/api/telegram/link.ts` → D1 `telegram_account_link_codes` | 116 ephemeral code rows |
| Bot consume → "link" | `workers/fenrir-stars-payments.js` **and** `functions/api/telegram/webhook.ts` → D1 `telegram_identity_links` (keyed by `frisky_user_id`) | **0 rows** |
| community-bridge "linked?" | `user_roles.telegram_id` in Supabase, set only by orphan `redeem_telegram_link_code` (6-char, uppercased) | RPC **absent** in yqev → path dead |
| Real linked identities | Supabase `telegram_identity_links` (`auth.users.id ↔ telegram`) | **10 rows** (incl. your `babaji.alvarez@gmail.com`) |

**Identity model (the linchpin):** `functions/_lib/supabase.ts` derives
`frisky_user_id = stableFriskyId("usr","supabase:"+auth.users.id)` — a one-way hash of the
Supabase UUID (not the UUID). So D1/billing/bot speak `frisky_user_id/org`, Supabase speaks
`auth.users.id`. The universal join keys between the two worlds are **`email`**
(`profiles.email` unique) and **`telegram_id`** — so the backfill needs no hash re-derivation.

## 3. Canonical schema (yqev `public`) — the SoT

Migration `20260809160000_account_links_sot.sql`:

- **`account_links`** — the ONLY truth for "is this identity linked?": `supabase_user_id uuid → auth.users(id)`, `telegram_id bigint`, `provider`, `status`, `verified_at`, `frisky_user_id/frisky_org_id/email` (bridge to the D1/billing world), timestamps. Uniques: `(supabase_user_id, provider)` and `(provider, telegram_id)`.
- **`link_codes`** — single-use, short-lived deep-link codes (`code` PK, `supabase_user_id`, `expires_at`, `consumed_at`, `status`). The SoT copy; **D1 stays as cache/queue**.
- **`account_billing`** — the Stripe anchor: `supabase_user_id` PK, `stripe_customer_id` **unique**, plus `frisky_user_id/org/email`.

**RLS:** enabled on all three; `authenticated` gets **SELECT-your-own**
(`supabase_user_id = auth.uid()`); `anon` revoked; **writes only via `service_role`** (which
bypasses RLS). This is how "todos leen de ahí" is enforced.

## 4. Single writer

- **`functions/_lib/account-links.ts`** — the one module that writes `account_links` (service-role PostgREST, same style as `supabase-profiles.ts`): `resolveSupabaseUserId()` (telegram→email→frisky→legacy map), `createLinkCode()`, `upsertAccountLink()`, `consumeLinkCode()`, `getAccountLinkBy*()`.
- **`POST /api/telegram/link/confirm`** (`functions/api/telegram/link/confirm.ts`) — the server-to-server writer surface the bot calls. Authenticated by **HMAC-SHA256 over the raw body** with a shared secret (`TELEGRAM_LINK_CONFIRM_SECRET`, from wrangler/1Password — never git); timing-safe compare. It consumes the SoT `link_code` and upserts `account_links`.
- **Generator** `POST /api/telegram/link` now **dual-writes**: the D1 code (fast cache for the bot) **and** the SoT `link_codes` row (same code). `GET` reads the SoT first, D1 only as fallback.

## 5. Repointing

**Bot (`fenrir-stars-payments`) — D1 becomes cache/queue, not truth.** After the existing D1
consume, the worker calls `POST /api/telegram/link/confirm` (HMAC-signed). It has no
service-role key by design, so it *must* go through the endpoint — exactly the single-writer
rule. New config: `FENRIR_LINK_CONFIRM_URL` (var) + `TELEGRAM_LINK_CONFIRM_SECRET` (secret).
The in-repo Pages webhook (`functions/api/telegram/webhook.ts`), which *does* have the
service key, calls the same `consumeLinkCode()` in-process. Double-processing is idempotent
(second consume sees the code already `consumed`; the upsert is a no-op). Edits delivered as
anchored snippets in `PATCHES.md` because both files are hot in the current bot WIP.

**community-bridge — reads the SoT.** `get-my-account.ts` and `use-auth.tsx` now read
`account_links` (RLS select-own) for `telegram_linked` instead of `user_roles.telegram_id`.
`link-telegram-account.ts` **stops calling** the orphan `redeem_telegram_link_code` /
6-char path entirely and just reports canonical status + points at the deep-link flow. During
transition the single writer also **mirrors** `telegram_id` into the legacy
`telegram_identity_links` / `user_roles` so nothing that still reads them breaks.

## 6. Stripe anchored to the canonical identity (coordinated with the trial task)

The choke point is `billing-db.ts::upsertCustomer`, called by **both** `stripe/webhook.ts`
and the trial system's `trial/setup-intent.ts` (which already **reuses** the existing
`billing_customers` customer before creating one). So a single mirror at those two call
sites — `anchorStripeCustomer(env, {stripe_customer_id, frisky_org_id, frisky_user_id, email})`
(`functions/_lib/stripe-anchor.ts`) — writes the **same** `stripe_customer_id` into
`account_billing` keyed by the resolved `supabase_user_id`. Result: **one user ⇒ one MyFenrir
identity ⇒ one Stripe customer**, with **no second customer** and **no change to the trial
code's own logic** (it keeps its D1 `trials`/`billing_customers`; those now point at the SoT).
Telegram-Stars' synthetic `stars_*` "customer" is explicitly skipped. Stripe keys stay in
secrets (`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` via op/wrangler) — untouched, never git.

## 7. Migration (idempotent, one-time)

- `20260809160100_backfill_account_links.sql` — in-Supabase seed of `account_links` from the **10** existing `telegram_identity_links` rows + any `user_roles.telegram_id`. Guarded by `NOT EXISTS` against **both** unique constraints → fully re-runnable.
- `scripts/backfill-account-links.mjs` — cross-system D1 → Supabase reconcile (identity links → `account_links`, `billing_customers` → `account_billing`). **0 rows in D1 today**, so it's a no-op now; kept for forward-safety, idempotent via PostgREST upserts, `--dry` supported.

## 8. Verification (done here; and the handoff checklist)

Validated **live against yqev's real schema and data inside a `DO $$…$$` block that
`RAISE`d to force rollback** — DDL, backfill, idempotency, constraints and RLS all executed,
nothing committed:

```
SOT_VALIDATION al=10 al_rerun=10 lc=0 ab=0 policies=3 uniques=2 own_pred=1 other_pred=0
```
→ backfill seeds exactly the 10 links; re-run adds 0 (idempotent); `link_codes`/`account_billing`
created empty; 3 select-own policies + 2 unique constraints present; RLS predicate returns **1**
row for the owner and **0** for anyone else. Post-check: all three tables `null` on prod
(nothing leaked). The read-only backfill preview independently confirmed **10 rows, 0 telegram
collisions, 0 null telegram_ids, 0 null emails**.

Not runnable from this sandbox (no Cloudflare/Supabase network; wrangler OAuth is interactive):
the git branch, `supabase db push`, the wrangler **preview** deploy, and the end-to-end
click-through. Exact commands are in `README-APPLY.md`. **Nothing was pushed to prod and the
in-progress bot branch was not touched.**

## 9. Files

```
ops/link-sot-consolidation/
├── REPORT.md                      ← this file
├── README-APPLY.md                ← branch + apply + preview + verify steps
├── PATCHES.md                     ← anchored edits to the 5 existing files
├── supabase/
│   ├── config.toml                ← pins the CLI to yqev (fixes the jgkt drift)
│   └── migrations/
│       ├── 20260809160000_account_links_sot.sql
│       └── 20260809160100_backfill_account_links.sql
├── fenrir-bridge/functions/_lib/account-links.ts     (single writer/reader)
├── fenrir-bridge/functions/_lib/stripe-anchor.ts     (Stripe → SoT mirror)
├── fenrir-bridge/functions/api/telegram/link/confirm.ts  (writer endpoint)
├── fenrir-bridge/functions/api/telegram/link.ts      (generator: SoT dual-write)
├── community-bridge/src/lib/mcp/tools/get-my-account.ts
├── community-bridge/src/lib/mcp/tools/link-telegram-account.ts
└── scripts/backfill-account-links.mjs
```
