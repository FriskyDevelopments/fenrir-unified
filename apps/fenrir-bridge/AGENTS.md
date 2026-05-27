# AGENTS.md — Fenrir Bridge (frisky-spark-lab)

## Project
- **Name**: Fenrir Bridge by Frisky
- **Domain**: myfenrir.com
- **Stack**: React 19 + TypeScript + Vite + TailwindCSS v4 + Cloudflare Pages + Pages Functions + D1

## Quick Context
This is the **production monorepo** for Fenrir Bridge. The app is deployed to Cloudflare Pages
(`fenrir-bridge` project) at `myfenrir.com`. All secrets are already set in Cloudflare Pages
production environment (SUPABASE_URL, SUPABASE_ANON_KEY, SESSION_SECRET, TELEGRAM_BOT_TOKEN, etc.).

## Setup
```bash
cd apps/fenrir-bridge
npm install
npm run dev        # frontend dev server
npm run api:dev    # Pages Functions dev (wrangler pages dev)
npm run build      # production build → dist/
npm run deploy     # wrangler pages deploy dist/ --project-name fenrir-bridge
```

## Deploy
```bash
npm run build && wrangler pages deploy dist/ --project-name fenrir-bridge
```

## Code Map
- `src/App.tsx` — root component, Supabase auth session management
- `src/components/` — UI components (sections, shared)
- `src/services/` — API client layer
- `functions/` — Cloudflare Pages Functions (edge API)
- `functions/_lib/` — shared utilities: auth.ts, billing-env.ts, readiness.ts, responses.ts
- `functions/api/` — API routes: auth/, billing/, bridges/, domains/, telegram/, stripe/, webauthn/
- `public/` — static assets (SVG icons, webmanifest, brand assets)
- `workers/` — standalone Cloudflare Workers (fenrir-gate-router, fenrir-stars-payments)
- `database/` — D1 schema SQL files
- `wrangler.jsonc` — Pages + D1 binding config
- `wrangler.fenrir-gate-router.toml` — Worker route config for `myfenrir.com/gate/*` and `www.myfenrir.com/gate/*`

## D1 Database
- **Name**: `fenrir-bridge`
- **ID**: `1238059e-2638-4317-982e-e74dda046ccb`
- **Tables (17)**: app_users, billing_customers, billing_subscriptions, frisky_audit_logs,
  frisky_bridges, frisky_domains, frisky_invites, frisky_live_rooms, stripe_events,
  telegram_account_link_codes, telegram_identity_links, telegram_permission_checks,
  telegram_stars_entitlements, telegram_stars_orders, webauthn_credentials,
  workspace_members, workspaces

## Current Status (2026-05-23)
- ✅ `myfenrir.com` is live and returning HTTP 200
- ✅ D1 database has 17 tables (schema applied)
- ✅ All required secrets set in Cloudflare Pages production env
- ✅ Non-Stripe go-live path uses Telegram Stars + D1 entitlement state
- ⚠️ Stripe/card billing is optional standby and must not block this launch path

## Immediate Tasks for AI Agents
1. **BUILD & DEPLOY** — Run `npm run build` then `wrangler pages deploy dist/ --project-name fenrir-bridge`
2. **TELEGRAM STARS SECRETS** — Required for this launch: TELEGRAM_BOT_TOKEN or TELEGRAM_PROD_BOT_TOKEN, FENRIR_TELEGRAM_BOT_USERNAME or MYFENRIR_TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET
3. **VERIFY /api/readiness** — After deploy, authenticated `curl https://myfenrir.com/api/readiness` should return JSON with `readyForPaidUsers: true` when OAuth, D1, and Telegram Stars are configured
4. **GOOGLE OAUTH REDIRECT** — Ensure `https://myfenrir.com/auth/callback` is added to Google Cloud Console OAuth client

## Working Rules
- Keep changes minimal and scoped
- Never commit secrets or .env files
- Prefer existing patterns in `functions/_lib/`
- Validate with `npm run build` before deploying
- The D1 binding name is `DB` — use `context.env.DB` in Functions
