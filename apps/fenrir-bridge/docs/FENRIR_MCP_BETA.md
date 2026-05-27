# Fenrir MCP Beta

Fenrir MCP Beta is the first server-side checkpoint for the production routing fix.
It is intentionally read-only for beta: health, route audit, readiness snapshot,
resources, and a divide-and-conquer plan.

## Endpoints

- `GET /api/health` returns JSON health.
- `GET /api/auth/me` returns unauthenticated JSON for smoke testing.
- `GET /api/readiness` returns beta readiness signals.
- `GET /api/routes/audit?path=/api/app-state` returns the expected route owner.
- Pages Functions own authenticated app APIs like `/api/auth/me`, `/api/telegram/link`, and `/api/telegram/readd`.
- `POST /mcp` accepts Streamable HTTP JSON-RPC MCP messages.
- `POST /api/mcp` is an alias for clients that must stay under `/api`.
- Unknown `/api/*` routes return JSON 404, not the SPA shell.

## MCP Methods

- `initialize`
- `notifications/initialized`
- `ping`
- `tools/list`
- `tools/call`
- `resources/list`
- `resources/read`

## Tools

- `fenrir.health`
- `fenrir.route_audit`
- `fenrir.readiness_snapshot`
- `fenrir.beta_plan`

## Resources

- `fenrir://beta/plan`
- `fenrir://routes/api-contract`
- `fenrir://status/health`

## Local

```bash
npm run mcp:beta:dev
```

## Deploy

```bash
npm run mcp:beta:deploy
```

Set the unified Frisky service token before exposing the beta endpoint:

```bash
wrangler secret put FRISKY_BOT_API_TOKEN --config wrangler.fenrir-mcp-beta.toml
```

Clients must send:

```text
Authorization: Bearer <FRISKY_BOT_API_TOKEN>
```

`MCP_BETA_TOKEN` is still accepted by the Worker as a legacy fallback, but new Fenrir/Frisky bot and MCP surfaces should use `FRISKY_BOT_API_TOKEN`.

## Cloudflare Routes

The beta Worker is bound only to MCP/read-only audit routes:

- `www.myfenrir.com/api/mcp*`
- `www.myfenrir.com/api/routes/audit*`
- `myfenrir.com/api/mcp*`
- `myfenrir.com/api/routes/audit*`

Pages Functions own authenticated app APIs such as `/api/auth/*`, `/api/telegram/*`,
and `/api/billing/*`. The client SPA still owns non-API routes such as `/main`.

## Telegram Recovery

`POST /api/telegram/readd` is a Pages Function, not an MCP write tool. It requires a
normal Fenrir session, an already-linked Telegram identity, and an active Telegram
lock owned by the same Fenrir workspace. It asks the configured Telegram bot to
create a one-use recovery invite that expires in 10 minutes. If the bot is not an
admin or cannot create invite links, the function returns JSON failure instead of
exposing a broken link.

## Production Routing Acceptance

- `GET /api/health` returns JSON, not `index.html`.
- Known `/api/*` endpoints return JSON with the correct status.
- Unknown `/api/*` returns JSON 404.
- `Content-Type` is `application/json`.
- SPA fallback still works for non-API client routes.
- Deployed custom domain behaves the same as preview.
