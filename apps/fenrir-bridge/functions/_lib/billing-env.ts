import type { AuthEnv } from "./auth";

export type BillingEnv = AuthEnv & {
  DB?: D1Database;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_STARTER_PRICE_ID?: string;
  STRIPE_PRO_PRICE_ID?: string;
  STRIPE_OPERATOR_PRICE_ID?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_PROD_BOT_TOKEN?: string;
  TELEGRAM_DEV_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  FENRIR_TELEGRAM_BOT_USERNAME?: string;
  MYFENRIR_TELEGRAM_BOT_USERNAME?: string;
  FENRIR_TELEGRAM_DEV_BOT_USERNAME?: string;
  FENRIR_STARS_PRICE?: string;
  FENRIR_STARS_TITLE?: string;
  FENRIR_STARS_DESCRIPTION?: string;
  FENRIR_STARS_LABEL?: string;
  /** Plan granted after Telegram Stars payment: starter | pro | operator (default starter). */
  FENRIR_STARS_PLAN?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  FENRIR_GOOGLE_OAUTH_CONFIGURED?: string;
  FENRIR_MICROSOFT_OAUTH_CONFIGURED?: string;
  FENRIR_APPLE_OAUTH_CONFIGURED?: string;
  NEON_DATABASE_URL?: string;
  WORKOS_CLIENT_ID?: string;
  WORKOS_API_KEY?: string;
  MEDIA_PROXY_ALLOWED_HOSTS?: string;
  /** Base URL for Stripe success/cancel/portal returns (no trailing slash). Falls back to request origin. */
  PUBLIC_SITE_URL?: string;
  /** Base URL for Authentication (e.g. auth.myfenrir.com). Falls back to PUBLIC_SITE_URL or request origin. */
  PUBLIC_AUTH_URL?: string;
};

export function requireEnv(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`missing_env:${name}`);
  return value.trim();
}

export function missingEnvResponse(name: string) {
  return Response.json(
    {
      ok: false,
      error: "billing_misconfigured",
      detail: `${name} is not set in the server environment.`
    },
    { status: 503 }
  );
}

export function dbNotConfiguredResponse() {
  return Response.json(
    {
      ok: false,
      error: "database_not_configured",
      detail: "D1 binding DB is not configured. Set database_id in wrangler.jsonc and apply docs/stripe-d1-schema.sql."
    },
    { status: 503 }
  );
}

export function siteOrigin(request: Request, env: BillingEnv) {
  const configured = env.PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function authOrigin(request: Request, env: BillingEnv) {
  const configured = env.PUBLIC_AUTH_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return siteOrigin(request, env);
}

export function cookieDomain(request: Request, env: BillingEnv) {
  const site = siteOrigin(request, env);
  try {
    const url = new URL(site);
    const parts = url.hostname.split(".");
    // If it's something like myfenrir.com, use the root domain for app cookies.
    if (parts.length >= 2) {
      // Basic logic: last two parts (e.g. myfenrir.com)
      // Note: doesn't handle co.uk but good enough for this MVP
      return parts.slice(-2).join(".");
    }
  } catch {
    // fallback to null
  }
  return undefined;
}
