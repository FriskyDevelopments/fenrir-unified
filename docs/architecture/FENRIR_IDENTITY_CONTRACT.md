# Fenrir Protocol — Master Identity Contract

**Status:** canonical · **Owner:** fenrir-bridge (MyFenrir) · **Updated:** 2026-06-20

The "Frisky account" (a.k.a. **Fenrir Protocol** account) is the single overarching
identity that **every** Frisky product authenticates against — ClipsFlow, HostCasa,
the Telegram bots, and anything new. This document is the source of truth for how
that identity works and how a new product integrates with it.

---

## 1. Canonical identity provider

| | |
|---|---|
| **Identity provider (system of record)** | Supabase project **FriskyDEV** |
| **Project ref** | **`yqevglppbhuoxxfsfnih`** |
| **URL** | `https://yqevglppbhuoxxfsfnih.supabase.co` |
| **Master account id** | **`auth.users.id` (UUID)** — call it `frisky_account_id` |

The FriskyDEV project is already shaped as a multi-product identity hub:
`auth.users` (accounts) + `public.profiles` (id = the UUID, `auth_subject`, `role`)
+ `public.user_roles` / `public.user_entitlements` / `public.user_subscriptions`
(membership & tier, all keyed by the UUID) + `public.app_concepts` (product catalog)
+ `public.fenrir_service_tokens` (machine creds). HostCasa runs in a **separate**
project (`vlmzocifueauzroeafxz`) and ClipsFlow stores its operational data in a
dedicated `clipsflow` schema **inside** FriskyDEV — but **both key their user data on
this UUID**. One human → one `auth.users` row → one account across all products.

> The master id is the **Supabase `auth.users` UUID**, never an email and never a
> provider-specific subject. Email is only the *join key* used to find/create that row.

---

## 2. Login channels vs. the account

Logins are just **authentication front-ends**; none of them *is* the account:

| Front-end | Where | How it proves identity |
|---|---|---|
| **WorkOS / AuthKit** (Google, Microsoft, Apple, passkey, email) | web — fenrir-bridge | OAuth/OIDC via WorkOS, server-side code exchange |
| **Direct OAuth** | web — fenrir-bridge | id_token verification |
| **Telegram OTP** | `friskyclaw` bot | Supabase `sign_in_with_otp` / `verify_otp` |
| **Telegram login widget** | web/bot | HMAC-SHA256 over the bot token |

**The unification rule:** after any front-end proves a **verified email**, that email
is resolved to the one canonical `auth.users` UUID (created if absent). That UUID is
what the session and every product key on.

- Web (bridge): `functions/_lib/frisky-account.ts → resolveFriskyAccountId(env, email)`
  uses the Supabase **admin** auth API (`GET/POST /auth/v1/admin/users`) to get-or-create
  the user and returns the UUID. It is stamped into the session as `frisky_account_id`
  (see `functions/api/auth/callback/workos.ts`).
- Bot (friskyclaw): `verify_otp` already returns the same `auth.users` UUID and writes
  `public.telegram_identity_links.user_id = <UUID>`.

### Session cookie (`fenrir_session`)
HMAC-SHA256 signed (`SESSION_SECRET`), HttpOnly/Secure/SameSite=Lax, 7-day TTL.
Payload (`functions/_lib/auth.ts`):

```jsonc
{
  "email": "...", "name": "...", "provider": "workos|telegram|google|...",
  "frisky_account_id": "<auth.users UUID>",  // CANONICAL — products key on this
  "frisky_user_id": "frisky_usr_...",        // DEPRECATED legacy synthetic id
  "frisky_org_id":  "frisky_org_...",
  "iat": 0, "exp": 0
}
```

> **Gap that was fixed:** `frisky_user_id` is an FNV-1a hash of `provider:sub`, so the
> *same human* got a *different* id from Google vs Telegram — it is **not** a stable
> cross-product key. `frisky_account_id` (the Supabase UUID) replaces it. The legacy
> field is retained additively for old sessions/rows and should be treated as opaque.

---

## 3. Omnichannel channel-linking

A channel (Telegram, WhatsApp, …) is a **swappable child** of the account:

- **Link once:** front-end verifies the channel, writes a row mapping
  `channel_user_id → account UUID`.
- **Re-link if lost:** delete the row and insert a new one — the **account is never
  touched**, so it persists across any channel change.
- **Account survives a lost channel:** unlinking only removes the mapping.

**Canonical table (new):** `public.account_channels`
`(user_id uuid, channel_type, channel_user_id, channel_handle, …)`, unique on
`(channel_type, channel_user_id)`. The legacy `public.telegram_identity_links` keeps
working unchanged; a DB trigger mirrors it into `account_channels`, so the Telegram bot
needs **no code change**. See `supabase/migrations/20260620190000_fenrir_protocol_identity.sql`.

---

## 4. Per-product data & the client-id contract

Each product **owns its app-specific data**, keyed to the master UUID, with blast-radius
isolation:

- **Dedicated schema in FriskyDEV** (preferred): e.g. `clipsflow.*`, rows keyed to
  `auth.users.id`. Expose only `public.<product>_*` RPCs to PostgREST so the product
  schema stays unexposed.
- **Separate Supabase project** (when already split): e.g. HostCasa
  (`vlmzocifueauzroeafxz`) — store a `frisky_account_id uuid` column on its user rows to
  map back to the master.

**Per-product client ids.** Each product issues a per-account credential
`<prefix>_live_<32hex>` (ClipsFlow: `cf_live_…`), stored in the product's own
`accounts` table next to the master `user_id`. The catalog of products and their
contract lives in **`public.product_registry`** (`concept_slug`, `client_id_prefix`,
`data_schema`/`data_supabase_ref`, `overview_rpc`, `allowed_redirect_uris`, `scopes`).
Machine-to-machine service credentials use `public.fenrir_service_tokens`
(`token_hash`, `scopes`, `acts_as`).

---

## 5. How a NEW product integrates (reference: ClipsFlow)

1. **Register** the product: add a row to `public.app_concepts` (catalog) and
   `public.product_registry` (contract) — pick a `concept_slug` and `client_id_prefix`.
2. **Authenticate** users against FriskyDEV (`yqevglppbhuoxxfsfnih`):
   - SSO web: send users through fenrir-bridge / WorkOS, read the `fenrir_session`
     cookie, trust `frisky_account_id`; **or**
   - Direct: Supabase `sign_in_with_otp`/`verify_otp` (bot/portal), which yields the
     same `auth.users` UUID.
3. **Provision** on first login: create `<schema>.accounts(user_id = UUID,
   client_id = '<prefix>_live_<32hex>')`; expose `public.<product>_account_overview()`.
4. **Gate** on membership/tier by reading `public.user_subscriptions` /
   `subscription_plans` / `user_roles` (keyed by UUID). Make tier lookups defensive.
5. **Link channels** through `public.account_channels` (or the product's own table that
   defers to the master UUID).
6. **Never** mint a parallel account namespace. The UUID from FriskyDEV is the account.

ClipsFlow implements exactly this on branch `feat/clipsflow-user-system` in `~/ClipFLOW`
(`supabase/migrations/…clipsflow_user_system.sql`, `services/clipsflow_accounts.py`,
`portal/`). Use it as the template.

---

## 6. Required environment variables (no secrets in this repo)

**fenrir-bridge (Cloudflare Pages):**
- `SESSION_SECRET` — session/state cookie HMAC.
- `WORKOS_CLIENT_ID`, `WORKOS_API_KEY` — web login broker.
- `SUPABASE_URL` = `https://yqevglppbhuoxxfsfnih.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — **required** for `resolveFriskyAccountId` (admin auth API)
  and the profile store. Without it, login still works but falls back to the legacy id.
- (existing) `GOOGLE_*`, `MICROSOFT_*`, `APPLE_*`, `TELEGRAM_BOT_TOKEN`, redirect/site vars.

**Any product integrating (bot/portal):**
- `SUPABASE_URL` = the FriskyDEV URL above.
- `SUPABASE_SERVICE_ROLE_KEY` (server RPCs) and/or `SUPABASE_ANON_KEY` (user-context auth).
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` for web portals.

Source of truth for secret values = 1Password → synced to Cloudflare + Google Secret
Manager. Do not hardcode keys.

---

## 7. Open items (need a human / are outward-facing)

- **Apply the migration** `supabase/migrations/20260620190000_fenrir_protocol_identity.sql`
  to FriskyDEV (`supabase db push`) — additive, but it touches the production identity DB,
  so it is left for explicit application.
- **Set `SUPABASE_SERVICE_ROLE_KEY`** on the fenrir-bridge Pages project if not already,
  so `frisky_account_id` is populated on web logins. Then `npm run deploy`.
- **Wire the remaining front-ends** the same way the WorkOS callback now is: stamp
  `frisky_account_id` in `functions/_lib/oauth.ts` and `functions/_lib/telegram-login.ts`,
  and pass the resolved UUID (not `provider:sub`) to `upsertProfileForSession` so
  `profiles.id` is the UUID everywhere.
- **WorkOS env** is still the sandbox client (`client_01KSSSJE…`); the production env
  needs the real Google/Microsoft/Apple OAuth creds. See `myfenrir-auth-architecture`.
