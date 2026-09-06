import type { FriskyAuthEnv, FriskyAuthOptions, FriskySocialProvider } from "./types";

const DEFAULT_ORIGINS = [
  "https://www.myfenrir.com",
  "https://myfenrir.com",
  "https://auth.myfenrir.com",
  "http://localhost:5173",
  "http://localhost:8788",
];

/**
 * Determines whether a value is a string containing non-whitespace characters.
 *
 * @param value - The value to check
 * @returns `true` if the value contains non-whitespace characters, `false` otherwise.
 */
function nonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Determines whether a configuration value represents an enabled flag.
 *
 * @param value - The value to evaluate
 * @returns `true` if the value is `1`, `true`, `yes`, or `on`, ignoring case and surrounding whitespace; `false` otherwise.
 */
export function enabledFlag(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

/**
 * Resolves the Neon database connection string from the environment.
 *
 * @param env - Environment variables containing the preferred and fallback database URLs
 * @returns The trimmed Neon database URL
 */
export function neonConnectionString(env: FriskyAuthEnv): string {
  const url = env.NEON_DATABASE_URL?.trim() || env.DATABASE_URL?.trim();
  if (!url) throw new Error("missing_env:NEON_DATABASE_URL");
  return url;
}

/**
 * Resolves the authentication secret from the available environment variables.
 *
 * @param env - Environment variables containing the authentication secret candidates
 * @returns The trimmed authentication secret
 * @throws An error if no authentication secret is configured
 */
export function friskyAuthSecret(env: FriskyAuthEnv): string {
  const secret = env.BETTER_AUTH_SECRET?.trim() || env.FRISKY_AUTH_SECRET?.trim() || env.SESSION_SECRET?.trim();
  if (!secret) throw new Error("missing_env:BETTER_AUTH_SECRET");
  return secret;
}

/**
 * Determines which social authentication providers have complete credentials configured.
 *
 * @param env - Environment values containing social provider credentials
 * @returns The configured social provider identifiers
 */
export function enabledSocialProviders(env: FriskyAuthEnv): FriskySocialProvider[] {
  const providers: FriskySocialProvider[] = [];
  if (nonEmpty(env.GOOGLE_CLIENT_ID) && nonEmpty(env.GOOGLE_CLIENT_SECRET)) providers.push("google");
  if (nonEmpty(env.MICROSOFT_CLIENT_ID) && nonEmpty(env.MICROSOFT_CLIENT_SECRET)) providers.push("microsoft");
  if (appleConfigured(env)) providers.push("apple");
  return providers;
}

/**
 * Determines whether Apple app-login is configured.
 *
 * @param env - Environment values containing the Apple app-login credentials
 * @returns `true` if both the Apple client ID and client secret are present, `false` otherwise
 */
export function appleConfigured(env: FriskyAuthEnv): boolean {
  return nonEmpty(env.APPLE_CLIENT_ID) && nonEmpty(env.APPLE_CLIENT_SECRET);
}

/**
 * Builds the trusted origins used for authentication from defaults and environment configuration.
 *
 * @param env - Environment values containing configured site, authentication, and additional origins
 * @param baseURL - The normalized application base URL to trust
 * @returns A deduplicated list of trusted origins with whitespace and trailing slashes removed
 */
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

/**
 * Determines the shared cookie domain for a Frisky base URL.
 *
 * @param baseURL - The base URL whose hostname determines the cookie scope
 * @returns `myfenrir.com` for the main domain and its subdomains, `undefined` otherwise
 */
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

/**
 * Builds social provider configurations from available environment credentials.
 *
 * @param env - Environment values containing social provider credentials
 * @returns Configured Google, Microsoft, and Apple providers with trimmed credentials
 */
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

/**
 * Builds Frisky Auth options from the runtime environment and base URL.
 *
 * @param input - The environment, database, and base URL used to configure authentication
 * @returns Authentication options with normalized URLs, resolved credentials, trusted origins, social providers, and cookie-domain settings
 */
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
