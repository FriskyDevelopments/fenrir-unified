/**
 * Host-isolated Supabase storage for Community Bridge.
 *
 * Older releases copied the refresh token into a JavaScript-readable cookie
 * scoped to every *.myfenrir.com host. That meant an XSS on any sibling host
 * could read the Community refresh token. New sessions stay in this origin's
 * localStorage. The old cookie is read once for a cutover-safe migration and
 * then deleted from the parent domain.
 */

function isBrowser() {
  return typeof document !== "undefined" && typeof window !== "undefined";
}

function readCookie(name: string): string | null {
  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
  }
  return null;
}

function deleteCookie(name: string) {
  const encoded = encodeURIComponent(name);
  document.cookie = `${encoded}=; path=/; max-age=0; SameSite=Lax`;
  if (
    window.location.hostname === "myfenrir.com" ||
    window.location.hostname.endsWith(".myfenrir.com")
  ) {
    document.cookie = `${encoded}=; path=/; domain=.myfenrir.com; max-age=0; SameSite=Lax; Secure`;
  }
}

/** Lee una cookie posiblemente troceada (`name.0`, `name.1`, …). */
function readChunked(name: string): string | null {
  const single = readCookie(name);
  if (single) return single;
  let out = "";
  for (let index = 0; ; index += 1) {
    const part = readCookie(`${name}.${index}`);
    if (part === null) break;
    out += part;
  }
  return out.length ? out : null;
}

function clearChunks(name: string) {
  deleteCookie(name);
  for (let index = 0; index < 12; index += 1) {
    if (readCookie(`${name}.${index}`) === null) break;
    deleteCookie(`${name}.${index}`);
  }
}

/**
 * localStorage-backed adapter with one-time migration from the legacy cookie.
 */
export const hostSessionStorage = {
  getItem(key: string): string | null {
    if (!isBrowser()) return null;
    try {
      const current = window.localStorage.getItem(key);
      if (current) {
        clearChunks(key);
        return current;
      }
      const legacy = readChunked(key);
      if (!legacy) return null;
      window.localStorage.setItem(key, legacy);
      clearChunks(key);
      return legacy;
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    if (!isBrowser()) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage quotas/private mode; Supabase reports persistence errors.
    }
    try {
      clearChunks(key);
    } catch {
      // Cookie cleanup is best effort during the migration window.
    }
  },

  removeItem(key: string): void {
    if (!isBrowser()) return;
    try {
      clearChunks(key);
    } catch {
      // Ignorar.
    }
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignorar.
    }
  },
};

/**
 * Keep Supabase's standard key so existing host-local sessions survive the
 * cutover without a forced sign-in.
 */
export function sharedStorageKey(supabaseUrl: string): string {
  const ref = supabaseUrl.replace(/^https?:\/\//, "").split(".")[0] ?? "auth";
  return `sb-${ref}-auth-token`;
}
