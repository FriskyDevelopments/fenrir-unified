/**
 * Community's Supabase session belongs to this origin. Keep the generated
 * client's adapter names, but never import or publish parent-domain cookies:
 * MyFenrir app identity and other tenants must not become Community sessions.
 * Legacy shared tokens remain untouched and require a fresh Community sign-in.
 */
export const sharedSessionStorage = {
  getItem(key: string): string | null {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage may be unavailable in private browsing.
    }
  },
  removeItem(key: string): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage may be unavailable in private browsing.
    }
  },
};

export function sharedStorageKey(supabaseUrl: string): string {
  const ref = new URL(supabaseUrl).hostname.split(".")[0] ?? "auth";
  return `fenrir-community-${ref}-auth-token`;
}
