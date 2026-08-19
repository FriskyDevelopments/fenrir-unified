# Apply guide — MyFenrir link Source-of-Truth consolidation

Everything here was authored in this session but **not** committed to your
in-progress branch (`codex/fix-myfenrir-favicon`) and **not** deployed to prod, so
it can't collide with the live bot/favicon work. The Supabase DDL + backfill + RLS
were validated against the **real** yqev schema and data inside a transaction that
was rolled back (zero prod residue). Steps below put it on its own branch and to a
preview.

The sandbox that generated this had no shell/network to Cloudflare, so the
`wrangler`/`supabase` CLI steps must run on your machine (already OAuth-authed).

## 0. Branch off a clean base (isolates from the WIP)
```bash
cd ~/fenrir-unified
git fetch origin
git switch -c claude/myfenrir-link-sot-consolidation origin/main
```

## 1. Drop the files into place
```bash
BASE=ops/link-sot-consolidation

# fenrir-bridge (new + replacements)
mkdir -p apps/fenrir-bridge/supabase/migrations apps/fenrir-bridge/functions/api/telegram/link
cp $BASE/supabase/config.toml                          apps/fenrir-bridge/supabase/config.toml
cp $BASE/supabase/migrations/*.sql                     apps/fenrir-bridge/supabase/migrations/
cp $BASE/fenrir-bridge/functions/_lib/account-links.ts apps/fenrir-bridge/functions/_lib/
cp $BASE/fenrir-bridge/functions/_lib/stripe-anchor.ts apps/fenrir-bridge/functions/_lib/
cp $BASE/fenrir-bridge/functions/api/telegram/link/confirm.ts apps/fenrir-bridge/functions/api/telegram/link/confirm.ts
cp $BASE/fenrir-bridge/functions/api/telegram/link.ts  apps/fenrir-bridge/functions/api/telegram/link.ts   # generator (SoT dual-write)
cp $BASE/scripts/backfill-account-links.mjs            apps/fenrir-bridge/scripts/ 2>/dev/null || cp $BASE/scripts/backfill-account-links.mjs scripts/

# community-bridge (replacements)
cp $BASE/community-bridge/src/lib/mcp/tools/get-my-account.ts       apps/community-bridge/src/lib/mcp/tools/
cp $BASE/community-bridge/src/lib/mcp/tools/link-telegram-account.ts apps/community-bridge/src/lib/mcp/tools/
```
Then apply the 5 anchored edits in `PATCHES.md` (webhook.ts, worker.js,
stripe/webhook.ts, trial/setup-intent.ts, use-auth.tsx).

## 2. Secrets (never in git)
```bash
# shared HMAC secret for the bot -> writer endpoint
openssl rand -hex 32   # generate once; store in 1Password "Fenrir Alpha Secrets"

# Pages (fenrir-bridge): TELEGRAM_LINK_CONFIRM_SECRET  (confirm.ts verifies)
#   set via 1Password -> Cloudflare Pages env (scripts/sync-alpha-secrets.sh path)
# Worker (fenrir-stars): same value
cd apps/fenrir-bridge
wrangler secret put TELEGRAM_LINK_CONFIRM_SECRET --config wrangler.fenrir-stars.toml
# + add  FENRIR_LINK_CONFIRM_URL = "https://www.myfenrir.com/api/telegram/link/confirm"  to [vars] in that toml
```
The writer/anchor also need `SUPABASE_SERVICE_ROLE_KEY` (already present on the
Pages env). Stripe keys are unchanged and stay in secrets.

## 3. Apply the Supabase migrations (versioned)
The DDL + backfill were already validated transactionally on yqev (rolled back).
Apply for real via the CLI (linked to yqev by the new config.toml):
```bash
cd apps/fenrir-bridge
supabase db push        # applies 20260809160000 + 20260809160100 to yqev
```
`20260809160100_backfill_account_links.sql` recovers the 10 existing Supabase-side
links (idempotent). For any Cloudflare-D1-side rows (0 today), run:
```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-account-links.mjs --dry   # preview
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-account-links.mjs          # write
```

## 4. Preview deploy (no prod, wrangler OAuth — no API tokens)
```bash
cd apps/fenrir-bridge
npm ci && npm run build
env -u CLOUDFLARE_API_TOKEN deno run -A npm:wrangler@4 pages deploy dist \
  --project-name fenrir-bridge --branch link-sot-preview
# bot worker preview:
env -u CLOUDFLARE_API_TOKEN deno run -A npm:wrangler@4 deploy \
  --config wrangler.fenrir-stars.toml --name fenrir-stars-payments-preview --dry-run   # inspect first
```

## 5. Verify the circuit
1. Sign in on the preview, Dashboard → **Link Telegram** → confirm `POST /api/telegram/link`
   returns a `t.me/Myfenrir_bot?start=link_<code>` URL and a `link_codes` row appears
   (RLS: you can select your own).
2. Open the deep-link, press Start. The bot consumes the D1 code AND calls
   `POST /api/telegram/link/confirm` (or the Pages webhook writes in-process).
3. `select * from account_links where email = '<you>'` → one `status='linked'` row.
4. community-bridge dashboard shows linked; `get_my_account` returns `telegram_linked:true`
   sourced from `account_links`.
5. (Stripe) run a trial `setup-intent` in Stripe **test mode** → `account_billing` gets
   the same `stripe_customer_id` that D1 `billing_customers` holds. One customer.

## 6. Promote
Only after the preview verifies, merge `claude/myfenrir-link-sot-consolidation` and
deploy to prod. Reconcile the two anchored hot-file edits (webhook.ts, worker.js)
with the in-progress bot branch at merge time — the edits are additive and orthogonal.
