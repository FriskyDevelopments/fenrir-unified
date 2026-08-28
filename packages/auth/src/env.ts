import type { FriskyAuthEnv, FriskyAuthOptions, FriskySocialProvider } from "./types";

const DEFAULT_ORIGINS = [
  "https://www.myfenrir.com",
  "https://myfenrir.com",
  "https://auth.myfenrir.com",
  "http://localhost:5173",
  "http://localhost:8788",
];

function nonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function enabledFlag(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

export function neonConnectionString(env: FriskyAuthEnv): string {
  const url = env.NEON_DATABASE_URL?.trim() || env.DATABASE_URL?.trim();
  if (!url) throw new Error("missing_env:NEON_DATABASE_URL");
  return url;
}

export function friskyAuthSecret(env: FriskyAuthEnv): string {
  const secret = env.BETTER_AUTH_SECRET?.trim() || env.FRISKY_AUTH_SECRET?.trim() || env.SESSION_SECRET?.trim();
  if (!secret) throw new Error("missing_env:BETTER_AUTH_SECRET");
  return secret;
}

export function enabledSocialProviders(env: FriskyAuthEnv): FriskySocialProvider[] {
  const providers: FriskySocialProvider[] = [];
  if (nonEmpty(env.GOOGLE_CLIENT_ID) && nonEmpty(env.GOOGLE_CLIENT_SECRET)) providers.push("google");
  if (nonEmpty(env.MICROSOFT_CLIENT_ID) && nonEmpty(env.MICROSOFT_CLIENT_SECRET)) providers.push("microsoft");
  if (appleConfigured(env)) providers.push("apple");
  return providers;
}

/**
 * Better Auth Apple is live only when a pre-minted client secret JWT is present.
 * Community Gate Apple still uses APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY
 * on the fenrir_* membership plane; those vars must not advertise app-login Apple.
 */
export function appleConfigured(env: FriskyAuthEnv): boolean {
  return nonEmpty(env.APPLE_CLIENT_ID) && nonEmpty(env.APPLE_CLIENT_SECRET);
}

export function trustedOriginsFromEnv(env: FriskyAuthEnv, baseURL: string): string[] {
  const extra = (env.FENRIR_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const configured = [env.PUBLIC_SITE_URL, env.PUBLIC_AUTH_URL, env.BETTER_AUTH_URL, baseURL]
    .map((item) => item?.trim().replace(/\/+$/, ""))
    .filter((item): item is string => Boolean(item));
  return [...new Set([...DEFAULT_ORIGINS, ...configured, ...extra])];
}

export function cookieDomainFromBaseURL(baseURL: string): string | undefined {
  try {
    const { hostname } = new URL(baseURL);
    if (hostname === "localhost" || hostname.endsWith(".localhost")) return undefined;
    // Do not set Domain=.pages.dev / .workers.dev — that would leak cookies.
    if (hostname === "myfenrir.com" || hostname.endsWith(".myfenrir.com")) return "myfenrir.com";
  } catch {
    return undefined;
  }
  return undefined;
}

export function socialProviderConfig(env: FriskyAuthEnv): FriskyAuthOptions["socialProviders"] {
  const social: FriskyAuthOptions["socialProviders"] = {};
  if (nonEmpty(env.GOOGLE_CLIENT_ID) && nonEmpty(env.GOOGLE_CLIENT_SECRET)) {
    social.google = { clientId: env.GOOGLE_CLIENT_ID.trim(), clientSecret: env.GOOGLE_CLIENT_SECRET.trim() };
  }
  if (nonEmpty(env.MICROSOFT_CLIENT_ID) && nonEmpty(env.MICROSOFT_CLIENT_SECRET)) {
    social.microsoft = {
      clientId: env.MICROSOFT_CLIENT_ID.trim(),
      clientSecret: env.MICROSOFT_CLIENT_SECRET.trim(),
    };
  }
  const appleSecret = env.APPLE_CLIENT_SECRET?.trim();
  if (nonEmpty(env.APPLE_CLIENT_ID) && appleSecret) {
    social.apple = { clientId: env.APPLE_CLIENT_ID.trim(), clientSecret: appleSecret };
  }
  return social;
}

export function authOptionsFromEnv(input: {
  env: FriskyAuthEnv;
  database: FriskyAuthOptions["database"];
  baseURL: string;
}): FriskyAuthOptions {
  const baseURL = input.baseURL.replace(/\/+$/, "");
  return {
    env: input.env,
    database: input.database,
    baseURL,
    secret: friskyAuthSecret(input.env),
    trustedOrigins: trustedOriginsFromEnv(input.env, baseURL),
    socialProviders: socialProviderConfig(input.env),
    cookieDomain: cookieDomainFromBaseURL(baseURL),
  };
}
