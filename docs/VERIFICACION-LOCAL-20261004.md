# Verificación local (sin secretos, sin deploy) — 2026-10-04

Requiere Node 22 para `apps/fenrir-bridge` (vitest usa `node:sqlite`); con Node 20 falla 1 archivo de tests.

    (cd packages/auth && npm ci --ignore-scripts)
    cd apps/fenrir-bridge && npm ci --ignore-scripts
    npx tsc --noEmit            # OK
    npx vitest run              # 38 archivos / 279 tests OK (Node 22)
    node --test workers/fenrir-auth/test/*.test.mjs workers/fenrir-redirects/worker.test.mjs   # 77 OK
    npx vite build              # OK

    cd apps/community-bridge && npm ci --ignore-scripts
    node scripts/check-gate-contract.mjs   # OK
    npx tsc --noEmit                       # OK
    npx vite build                         # OK

    cd apps/myfenrir-emails && npm ci --ignore-scripts
    npm test                               # 6/6 OK
    npx tsc --noEmit                       # OK

## Sigue pendiente (no se hizo: requiere secretos, merge o deploy)
Solo nombres de variables: TELEGRAM_BOT_TOKEN / TELEGRAM_PROD_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET,
STRIPE_WEBHOOK_SECRET (+ STRIPE_SECRET_KEY, price IDs), SESSION_SECRET, NEON_DATABASE_URL, binding D1 `DB`.
Además: merge del PR #38, redeploy de `main` en Pages `fenrir-bridge`, wrangler login. Ver
`apps/fenrir-bridge/docs/LAUNCH_BLOCKERS.md`.
