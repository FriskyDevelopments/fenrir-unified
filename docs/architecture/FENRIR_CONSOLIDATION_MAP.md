# Fenrir Consolidation Map

## Primary Product

`apps/fenrir-bridge`

Purpose:
- MyFenrir web dashboard and public app.
- Cloudflare Pages Functions API.
- Supabase session bridge.
- Telegram identity and Telegram Stars payment flow.
- D1/Worker entitlement truth.
- Community gate/auth experiments.
- Readiness and production smoke checks.

Important folders expected from source:
- `src/`: React/Vite frontend.
- `functions/`: Cloudflare Pages Functions API.
- `workers/`: standalone Cloudflare Workers.
- `docs/`: schemas, handoffs, launch/readiness docs.
- `scripts/`: verification, safe-box, deploy guards.
- `public/`: static brand and landing assets.
- `supabase/`: Supabase functions/migrations if present.

## Launch/Payment Rule

The non-Stripe launch path is:

```text
Telegram bot token -> Fenrir Worker runtime -> D1 entitlement state -> MyFenrir app
```

Gemini may remain an optional mind layer. It should not own payment or entitlement truth.

Stripe integrations are allowed as standby but should not block the Telegram Stars launch lane.

## Sidecar

`apps/fenrir-cinema`

Purpose:
- Remotion compositions.
- Admin guidebook visuals.
- Launch proof/walkthrough/video material.

Generated folders such as `build/` and `out/` are intentionally excluded from the GitLab seed.

## Legacy

`legacy/fenrir-portal`

Purpose:
- Keep older/static portal deployment experiments for reference.
- Do not treat as the active MyFenrir app unless explicitly revived.

## GitLab Shape

Recommended first GitLab repo:

```text
fenrir-unified/
  apps/
    fenrir-bridge/
    fenrir-cinema/
  legacy/
    fenrir-portal/
  docs/
    architecture/
  ops/
```

Later, this can become a formal npm workspace once the source folders are fully materialized and build behavior is stable.
