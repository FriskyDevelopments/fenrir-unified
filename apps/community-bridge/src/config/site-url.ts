/**
 * Site URL derivation — single source of truth for canonical URLs.
 *
 * Priority:
 *   1. VITE_SITE_URL env var (set explicitly for Quality/Production)
 *   2. window.location.origin (runtime — used for SSR and local dev)
 *
 * Every route that emits og:url, canonical link, or structured data
 * MUST derive its URL from here. Hardcoding breaks every deployment
 * that is not the original Lovable workspace.
 */

function readOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  // SSR fallback — env var must be set in build-time for static generation.
  const env = (import.meta as unknown as Record<string, unknown>).env as
    | Record<string, string | undefined>
    | undefined;
  return env?.["VITE_SITE_URL"] ?? "http://localhost:5173";
}

let _cached: string | null = null;

export function getSiteUrl(): string {
  if (_cached) return _cached;
  _cached = readOrigin();
  return _cached;
}

/** Reset cache (test seam). */
export function resetSiteUrlCache(): void {
  _cached = null;
}
