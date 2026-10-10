# Launch blockers — source-level audit

Audited against `main` @ `51340ae` (2026-09-26). Source: `apps/fenrir-bridge`.
Live observations (smoke-test results) come from the Fenrir Audit smoke test and were
**not re-run** for this doc. Anything marked **UNVERIFIED** could not be confirmed from
the repo alone. No secret values appear here — names only.

Context: `docs/MYFENRIR_ALPHA_LAUNCH_GATE.md:76` says Stripe is **not** a launch blocker
for the Telegram Stars alpha. Item 1b is therefore a card-billing standby item, not a
go-live gate, unless that policy changes.

## 1. Env vars the code requires that are reported missing in prod

Runtime for both routes is the **Cloudflare Pages Functions** project `fenrir-bridge`
(`wrangler.jsonc` `name`; default project name also in
`functions/_lib/cloudflare-pages-domain.ts:5`). The `Env` type is `BillingEnv`
(`functions/_lib/billing-env.ts`). Both values are **secrets** → Pages project
*Settings → Variables and Secrets* (Production environment), as encrypted secrets, not
`vars` in `wrangler.jsonc`. Neither is a Worker binding or a D1/KV/R2 binding.

### 1a. `TELEGRAM_BOT_TOKEN` — `POST /api/auth/telegram-session` → 503

- Route: `functions/api/auth/telegram-session.ts`
  - L15 `if (!context.env.DB) return dbNotConfiguredResponse();` (D1 binding `DB`, declared in `wrangler.jsonc`)
  - L16 `if (!telegramBotToken(context.env)) return missingEnvResponse("TELEGRAM_BOT_TOKEN");`
    → 503 `{"error":"billing_misconfigured","detail":"TELEGRAM_BOT_TOKEN is not set…"}`
    (`functions/_lib/billing-env.ts:64-73`)
  - L107-109 `telegramBotToken()` accepts any of `TELEGRAM_BOT_TOKEN`,
    `TELEGRAM_PROD_BOT_TOKEN`, `TELEGRAM_DEV_BOT_TOKEN`.
- Actual HMAC verification: `functions/_lib/telegram-login.ts:207-217` `telegramLoginBotToken()`
  accepts only `TELEGRAM_BOT_TOKEN` or `TELEGRAM_PROD_BOT_TOKEN`. `TELEGRAM_DEV_BOT_TOKEN`
  is used only if `TELEGRAM_ALLOW_DEV_BOT_TOKEN=true`, otherwise throws
  `telegram_bot_token_production_missing` (surfaced as 503 `verification_unavailable`,
  `telegram-session.ts:63-73`).
- Net: to fix, bind **one** of `TELEGRAM_BOT_TOKEN` / `TELEGRAM_PROD_BOT_TOKEN` as a Pages
  secret holding the production @Myfenrir_bot token. Binding only `TELEGRAM_DEV_BOT_TOKEN`
  passes the L16 guard but still 503s at verification.
- The 503 body distinguishes the two causes: `billing_misconfigured` (L16 guard) vs
  `verification_unavailable` + `reason` (telegram-login.ts). The smoke test only recorded
  "503", so which one fired is **UNVERIFIED**.
- Same name is also read by: `functions/_lib/readiness.ts:60` (readiness flag),
  `functions/_lib/telegram-stars.ts:26-32,127`, and — as separate Workers with their own
  bindings — `workers/fenrir-auth/src/telegram.js:191` (optional, login-notify) and
  `workers/fenrir-stars-payments.js:41-42`, `workers/fenrir-mcp-beta.js:330`. Setting it on
  Pages does **not** set it on those Workers (each has its own secret store).
- Also required by the same route and **not verified live**: D1 `DB` binding, `SESSION_SECRET`
  (session signing, `functions/_lib/auth.ts:191`).

### 1b. `STRIPE_WEBHOOK_SECRET` — `POST /api/stripe/webhook` → 503

- Route: `functions/api/stripe/webhook.ts` (`onRequestPost` at L149).
  - L164 `constructStripeWebhookEvent(rawBody, signature, context.env)`
  - L166-170 catch: error message containing `missing_env:` → `missingEnvResponse("STRIPE_WEBHOOK_SECRET")` → 503.
- Read at `functions/_lib/stripe.ts:13` `requireEnv(env.STRIPE_WEBHOOK_SECRET, "STRIPE_WEBHOOK_SECRET")`;
  type at `functions/_lib/billing-env.ts:12`; readiness flag `functions/_lib/readiness.ts:64`.
- Binding: Pages secret `STRIPE_WEBHOOK_SECRET` on project `fenrir-bridge` (matches
  `docs/TRIAL_INVITE_SYSTEM.md:111`, `docs/SECRET_PLACEMENT_AND_IPN.md:24`). The value is the
  signing secret of the Stripe webhook endpoint pointing at `https://myfenrir.com/api/stripe/webhook`
  (endpoint URL: **UNVERIFIED**; not confirmed from Stripe).
- Webhook processing after verification additionally needs `STRIPE_SECRET_KEY`
  (`functions/_lib/stripe.ts:6`, webhook.ts L186) and plan price IDs
  `STRIPE_STARTER_PRICE_ID`, `STRIPE_PRO_PRICE_ID`, `STRIPE_OPERATOR_PRICE_ID`
  (`functions/_lib/plan-catalog.ts:94-96`). Card checkout is additionally gated by
  `CARD_BILLING_ENABLED=true` (`billing-env.ts:80-82`).
- Separate code path: `workers/fenrir-stars-payments.js:423` (Stars Worker, its own Stripe
  webhook handling) reads the same name from **that Worker's** secrets. Which of the two
  endpoints Stripe actually calls is **UNVERIFIED**.

## 2. `/api/domains/lookup` and `/api/domains/capabilities` returned 404 live

Both routes **exist on `main`** as Pages Functions file routes:

- `apps/fenrir-bridge/functions/api/domains/lookup.ts` — `onRequestGet`, L6. Requires a session
  (401 `authentication_required` without one, L8); 400 `invalid_dns_query` on bad input.
- `apps/fenrir-bridge/functions/api/domains/capabilities.ts` — `onRequestGet`, L6. Also 401
  without a session (L8).
- Introduced by commit `d9bc07b` ("Add DNS diagnostics and require proof before domain
  connection"), landed on main via PR #30 (merged 2026-09-11). Tests:
  `functions/__tests__/domain-lifecycle.test.ts:11,165`. Client callers:
  `src/services/dnsLookup.ts:6`, `src/services/domainConnect.ts:13`. Docs:
  `docs/dns-wizard-integration.md:45,108`.
- Since source defines a session-gated handler, an *unauthenticated* request to a build that
  contains these files should return **401, not 404**. (The catch-all
  `functions/api/[[path]].ts:101-105` returns 404 `api_route_not_found`, but specific file routes
  take precedence in Pages.) Inference: the live Pages deployment does not contain these files,
  i.e. it is older than PR #30 / not built from current `main`, or the route manifest
  is stale. **UNVERIFIED** — deployment contents and which commit is live were not inspected.
- Action: confirm the production Pages deployment's commit; redeploy `main`.

## 3. PRs #23 / #25 and `/auth/coach` → `unknown_provider`

Checked with `gh pr view`:

| PR | State | Detail |
| --- | --- | --- |
| #23 "Restore auth recovery and harden Community Gate and lock flows" | **CLOSED, not merged** (2026-09-21) | Head `codex/myfenrir-working-20260905`, base `main`. Closed with comments "Superseded by cherry-pick PR #34". PR #34 (`fix(auth/gate): …(cherry #23)`) **is merged** (2026-09-21, `80dc1d9`) and is an ancestor of `main`. Per the comments, leftovers not carried over: authentik operator enable `e6d9569d`, `RotatingCtaButton` (since split to PR #36), merge `4104db9d`. |
| #25 "Return Coach OAuth cancellations to the bound broker flow" | **OPEN, DRAFT** | Head `fix/coach-oauth-cancellation-20260907`, **base is `codex/myfenrir-working-20260905`, not `main`** (stacked on #23). GitHub reports MERGEABLE (against that base). Touches only `workers/fenrir-auth/src/index.js` and `workers/fenrir-auth/test/coach-cancellation.test.mjs`. Its tip `c0b5adcc` is **not** an ancestor of `main`. Its description says it is deployed as authority version `6badbdc4-…`; that is a claim in the PR body — **UNVERIFIED** here. |

Consequences:
- #25 cannot land on main as-is: its base branch is the stale `codex/…` branch from closed #23.
  It would need retargeting/rebasing onto `main`. Also, if production runs a build from #25's
  tip, prod is ahead of `main` (drift).
- `/auth/coach` → `unknown_provider` is **expected behaviour of current main**, not a regression:
  `workers/fenrir-auth/src/index.js:453-456` treats any `/auth/<name>` as a provider start,
  `handleStart` L198-200 looks it up in `PROVIDERS` (`workers/fenrir-auth/src/config.js:6`,
  keys: `google`, `microsoft`, `apple`) and returns 404 `unknown_provider` for `coach`.
  Same mechanism documented for `/auth/callback` in `docs/OAUTH_PROVIDER_WIRING.md:45-57`.
- PR #25 does **not** add a `coach` provider either; it only handles *cancelled* Google/Apple/
  Microsoft callbacks whose saved `returnTo` is `/auth/coach/complete?flow=…` (diff of
  `coachFailureReturn`). `/auth/coach/complete` itself is 3 path segments and is not served by
  this Worker on main (`index.js:460` only routes `…/callback`; otherwise 404 `not_found`).
  Where the Coach broker lives is **UNVERIFIED** (no Coach broker code found in this repo
  beyond #25's test). If the Coach app expects `/auth/coach`, that contract must be defined
  elsewhere.

## 4. `bridge.myfenrir.com` has no DNS

- The repo treats this host as **retired**: `.env.example:92`
  ("Do not configure the retired bridge.myfenrir.com host"; canonical is
  `communities.myfenrir.com`), and `apps/community-bridge/scripts/deploy-production.sh:9`
  (production Worker is bound to `communities.myfenrir.com`).
  `functions/_lib/cloudflare-pages-domain.ts:7-12,54-56` lists `bridge.myfenrir.com` in
  `RESERVED_HOSTS` and rejects every `*.myfenrir.com` host in the customer domain wizard.
- Therefore, **no DNS record is required by the code**; absence of DNS is consistent with
  retirement. If the owner nonetheless wants it resolvable, the record that matches this
  repo's Pages setup (`pagesProject()` default `fenrir-bridge`, target
  `<project>.pages.dev`, DNS-only CNAME per `docs/dns-wizard-integration.md:117`) would be:

  | Type | Name | Target | Proxy |
  | --- | --- | --- | --- |
  | CNAME | `bridge` (zone `myfenrir.com`) | `fenrir-bridge.pages.dev` | per owner decision; the wizard doc mandates DNS-only for customer domains, own-zone choice is **UNVERIFIED** |

  plus attaching `bridge.myfenrir.com` as a custom domain on the Pages project. **Not created
  by this audit.** Which backend `bridge.myfenrir.com` *should* point to (Pages vs. the
  `communities.myfenrir.com` Worker) is a product decision — **UNVERIFIED**.

## Summary

| # | Blocker | On main? | Fix location |
| --- | --- | --- | --- |
| 1a | `TELEGRAM_BOT_TOKEN` (or `TELEGRAM_PROD_BOT_TOKEN`) | Code correct | Pages secret, project `fenrir-bridge` |
| 1b | `STRIPE_WEBHOOK_SECRET` (+ `STRIPE_SECRET_KEY`, price IDs) | Code correct; not an alpha gate | Pages secret, project `fenrir-bridge` |
| 2 | domains `lookup`/`capabilities` 404 | Routes exist on main | Redeploy Pages from `main` (deployment state UNVERIFIED) |
| 3 | PR #23 closed (superseded by merged #34); PR #25 draft, wrong base | #25 not on main | Retarget/rebase #25 onto main, or close; `unknown_provider` on `/auth/coach` is by design |
| 4 | `bridge.myfenrir.com` DNS | n/a | Retired host; no record needed unless owner decides otherwise |
