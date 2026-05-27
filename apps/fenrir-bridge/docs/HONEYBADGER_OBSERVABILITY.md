# Fenrir Honeybadger Observability

Fenrir reports browser errors through its own backend endpoint so the Honeybadger
project key is not exposed in the public Vite bundle.

## Runtime Flow

1. Browser errors and unhandled promise rejections are captured in `src/services/honeybadger.ts`.
2. The browser posts a scrubbed report to `/api/observability/client-error`.
3. The Pages Function forwards the notice to Honeybadger only when `HONEYBADGER_API_KEY` is configured.

## Required Secret

Set this as a Cloudflare Pages secret:

```bash
wrangler pages secret put HONEYBADGER_API_KEY --project-name fenrir-bridge
```

## Optional Environment Values

```bash
HONEYBADGER_ENVIRONMENT=production
HONEYBADGER_REVISION=<deploy sha or release id>
```

The reporter filters obvious token, password, cookie, and authorization fields
before sending context.
