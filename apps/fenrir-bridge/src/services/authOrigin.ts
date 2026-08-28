export const PRODUCTION_AUTH_ORIGIN = "https://myfenrir.com";

export function isWwwHostname(hostname: string): boolean {
  return hostname.toLowerCase() === "www.myfenrir.com";
}

/** Absolute Worker origin, or empty string for same-origin `/auth/*`. */
export function resolveAuthOrigin(origin: string, hostname: string): string {
  const configured = origin.trim().replace(/\/$/, "");
  if (configured) return configured;
  if (isWwwHostname(hostname)) return PRODUCTION_AUTH_ORIGIN;
  return "";
}
