export const PRODUCTION_AUTH_ORIGIN = "https://myfenrir.com";

/**
 * Determines whether a hostname is `www.myfenrir.com`.
 *
 * @param hostname - The hostname to evaluate
 * @returns `true` if the hostname matches `www.myfenrir.com` case-insensitively, `false` otherwise.
 */
export function isWwwHostname(hostname: string): boolean {
  return hostname.toLowerCase() === "www.myfenrir.com";
}

/**
 * Resolves the authentication origin from configuration and hostname.
 *
 * @param origin - The configured authentication origin
 * @param hostname - The current hostname
 * @returns The trimmed configured origin, the production origin for `www.myfenrir.com`, or an empty string for same-origin authentication
 */
export function resolveAuthOrigin(origin: string, hostname: string): string {
  const configured = origin.trim().replace(/\/$/, "");
  if (configured) return configured;
  if (isWwwHostname(hostname)) return PRODUCTION_AUTH_ORIGIN;
  return "";
}
