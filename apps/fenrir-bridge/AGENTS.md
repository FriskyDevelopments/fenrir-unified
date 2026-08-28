# AGENTS.md — Fenrir Bridge (frisky-spark-lab)

## Project
- **Name**: Fenrir Bridge by Frisky
- **Domain**: myfenrir.com
- **Stack**: React 19 + TypeScript + Vite + TailwindCSS v4 + Cloudflare Pages + Pages Functions + D1

## Quick Context
This is the **production monorepo** for Fenrir Bridge. The app is deployed to Cloudflare Pages
(`fenrir-bridge` project) at `myfenrir.com`.

App login (who is this user?) is Better Auth (`@frisky/auth`) on Neon `app_auth_*` once
`FRISKY_AUTH_ENABLED=1` plus `BETTER_AUTH_SECRET` / provider secrets are bound. Until that
flag is set, leftover direct OAuth under `/api/auth/*` still serves Google/Microsoft.
Community membership stays on `fenrir_*` + `fenrir_community_session`. Authentik is leftover.

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
- `src/App.tsx` — root component, Better Auth / Fenrir session management
- `src/components/` — UI components (sections, shared)
- `src/services/` — API client layer
- `functions/` — Cloudflare Pages Functions (edge API)
- `functions/_lib/` — shared utilities: auth.ts, billing-env.ts, readiness.ts, responses.ts
- `functions/api/` — API routes: frisky-auth/, auth/, billing/, bridges/, domains/, telegram/, stripe/, webauthn/
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

## Current Status (2026-08-24)
- ✅ `myfenrir.com` + `www` live; `npm run verify:prod` and `verify:readiness` (unauth) all green on prod
- ✅ Go-live audit merged to main + deployed (Cloudflare Pages `fenrir-bridge`)
  - Mocks/fake data eliminated in security-report
  - Queries aligned to real Neon gate schema (profiles, community_memberships, verification_sessions, communities)
  - Readiness relaxed for non-Stripe path: `readyForPaidUsers` now requires **at least one** primary auth provider (Google/Microsoft/Apple/frisky) + D1 + Neon + Telegram Stars rail
- ✅ 72 tests, typecheck, production build all clean
- ✅ Fresh post-merge hygiene audit (megabug + cloudflare + workers-best-practices dimensions) on main: no critical regressions or mocks; one scoped robustness fix + compat date bump
- ✅ D1 (17 tables) + Neon for gate + app-state operational
- ✅ Community gate, Telegram Stars, auth flows passing smoke tests
- ⚠️ Stripe/card billing remains optional standby

## Immediate / Post-Deploy Tasks
- Verify authenticated `/api/readiness` (with valid session) reports `readyForPaidUsers: true`
- Confirm Google OAuth redirect URIs registered for production
- Wire `CommunitySecurityReport` component into admin UI (API + service + types ready)
- Monitor Telegram Stars entitlements and community gate review flows in prod
- Keep secrets only in Cloudflare Pages env (never in git)

## Working Rules
- Keep changes minimal and scoped
- Never commit secrets or .env files
- Prefer existing patterns in `functions/_lib/`
- Validate with `npm run build` before deploying
- The D1 binding name is `DB` — use `context.env.DB` in Functions
