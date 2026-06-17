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
  MEDIA_PROXY_ALLOWED_HOSTS?: string;
  /** Base URL for Stripe success/cancel/portal returns (no trailing slash). Falls back to request origin. */
  PUBLIC_SITE_URL?: string;
  /** Base URL for Authentication (e.g. auth.myfenrir.com). Falls back to PUBLIC_SITE_URL or request origin. */
  PUBLIC_AUTH_URL?: string;
  /** Comma-separated list of allowed redirect URIs for authentication. */
  ALLOWED_REDIRECT_URIS?: string;
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
  const url = new URL(request.url);
  const requestOrigin = `${url.protocol}//${url.host}`;

  // If the request origin is in the allowed redirect URIs, prefer it.
  const allowed = (env.ALLOWED_REDIRECT_URIS || env.PUBLIC_SITE_URL || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  if (allowed.some(base => requestOrigin === base || requestOrigin.startsWith(base + "/"))) {
    return requestOrigin;
  }

  const configured = env.PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return requestOrigin;
}

export function authOrigin(request: Request, env: BillingEnv) {
  // Prefer explicitly configured auth URL (set as Cloudflare Pages secret or wrangler var).
  const configuredAuth = env.PUBLIC_AUTH_URL?.trim();
  if (configuredAuth) return configuredAuth.replace(/\/$/, "");

  // Fall back to the first auth.* subdomain in the allowed redirect list.
  // This means adding https://auth.myfenrir.com to ALLOWED_REDIRECT_URIS is enough
  // to pin the WorkOS redirect URI to that domain without needing a separate secret.
  const allowed = (env.ALLOWED_REDIRECT_URIS || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const authSubdomain = allowed.find((u) => {
    try { return new URL(u).hostname.startsWith("auth."); } catch { return false; }
  });
  if (authSubdomain) return authSubdomain.replace(/\/$/, "");

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
