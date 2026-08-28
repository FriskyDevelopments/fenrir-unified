import type { AuthEnv } from "./auth";

export type BillingEnv = AuthEnv & {
  EMAIL?: {
    send?: (message: { to: string; from: { email: string; name?: string }; subject: string; html: string; text: string }) => Promise<unknown>;
    fetch?: (request: Request) => Promise<Response>;
  };
  DB?: D1Database;
  /** R2 bucket for MyFenrir member media (avatars/covers/uploads); bound as MEDIA in wrangler.jsonc. */
  MEDIA?: R2Bucket;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_STARTER_PRICE_ID?: string;
  STRIPE_PRO_PRICE_ID?: string;
  STRIPE_OPERATOR_PRICE_ID?: string;
  STRIPE_COURTESY_COUPON_ID?: string;
  /** Card billing is deliberately opt-in while Telegram Stars is the launch rail. */
  CARD_BILLING_ENABLED?: string;
  FENRIR_COURTESY_CODE?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_PROD_BOT_TOKEN?: string;
  TELEGRAM_DEV_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_LINK_CONFIRM_SECRET?: string;
  FENRIR_LINK_CONFIRM_URL?: string;
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
  /** Token used to attach same-account zones as Pages custom domains. Not committed. */
  CLOUDFLARE_API_TOKEN?: string;
  /** Cloudflare account that owns fenrir-bridge Pages. Defaults in code if unset. */
  CLOUDFLARE_ACCOUNT_ID?: string;
  /** Pages project to attach custom domains to. Defaults to fenrir-bridge. */
  CLOUDFLARE_PAGES_PROJECT?: string;
  /** Base URL for Stripe success/cancel/portal returns (no trailing slash). Falls back to request origin. */
  PUBLIC_SITE_URL?: string;
  /** Base URL for Authentication (e.g. auth.myfenrir.com). Falls back to PUBLIC_SITE_URL or request origin. */
  PUBLIC_AUTH_URL?: string;
  /** Comma-separated list of allowed redirect URIs for authentication. */
  ALLOWED_REDIRECT_URIS?: string;
  /** Optional dedicated secret for native Frisky human challenges. SESSION_SECRET is used when absent. */
  HUMAN_VERIFICATION_HMAC_SECRET?: string;
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

/**
 * Card checkout must never become live merely because a Stripe key was bound
 * for another Fenrir workflow.  Requiring an explicit flag keeps the launch
 * promise (Telegram Stars first) true until the full card journey is tested.
 */
export function isCardBillingEnabled(env: BillingEnv) {
  return env.CARD_BILLING_ENABLED?.trim().toLowerCase() === "true";
}

export function cardBillingNotLiveResponse() {
  return Response.json(
    {
      ok: false,
      error: "card_billing_not_live",
      detail: "Telegram Stars is the current MyFenrir payment path."
    },
    { status: 409 }
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
  const url = new URL(request.url);
  const requestOrigin = `${url.protocol}//${url.host}`;

  const configuredAuth = env.PUBLIC_AUTH_URL?.trim();
  if (configuredAuth) {
    // If we are currently ON the configured auth domain, use it.
    if (requestOrigin === configuredAuth.replace(/\/$/, "")) {
      return requestOrigin;
    }
  }

  // If the current request origin is one of the allowed domains, it might be a white-label site.
  // In that case, we should check if it's supposed to use its own origin for auth or the central one.
  // For now, if PUBLIC_AUTH_URL is set, we generally want to use it for the OAuth provider config,
  // UNLESS the request is already on a domain that is allowed.
  
  if (configuredAuth) return configuredAuth.replace(/\/$/, "");
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
