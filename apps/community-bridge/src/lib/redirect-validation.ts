/**
 * Runtime validation of a brand's redirect configuration.
 *
 * A brand entry can point sign-in anywhere, but Supabase Auth only honours
 * redirect URLs on its allow-list, and only public routes can receive an OAuth
 * return. Both lists live here (env-overridable) so a misconfigured tenant
 * shows a clear error instead of silently bouncing users to the home page.
 */

import type { BrandConfig } from "@/config/brands";

/** Public, same-origin paths registered in the backend redirect allow-list. */
export const ALLOWED_OAUTH_RETURN_PATHS = readList(
  import.meta.env["VITE_ALLOWED_OAUTH_RETURN_PATHS"],
  ["/", "/login", "/auth/callback"],
);

/** Paths that exist in this app and can receive a signed-in user. */
export const ALLOWED_AFTER_LOGIN_PATHS = readList(
  import.meta.env["VITE_ALLOWED_AFTER_LOGIN_PATHS"],
  ["/", "/dashboard", "/activate", "/gates", "/gate", "/admin", "/brands"],
);

function readList(raw: unknown, fallback: string[]): string[] {
  if (typeof raw !== "string" || raw.trim() === "") return fallback;
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export interface RedirectIssue {
  field: "oauthReturnPath" | "afterLogin" | "host";
  message: string;
}

/** Same-origin relative path, no protocol-relative or absolute URLs. */
export function isSafeRelativePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("://");
}

/**
 * Validates one brand against the allow-lists. `origin` is optional; when
 * provided (browser), the brand's hostname mapping is checked too.
 */
export function validateBrandRedirects(
  brand: BrandConfig,
  origin?: string | null,
): RedirectIssue[] {
  const issues: RedirectIssue[] = [];
  const { oauthReturnPath, afterLogin } = brand.redirect;

  if (!isSafeRelativePath(oauthReturnPath)) {
    issues.push({
      field: "oauthReturnPath",
      message: `OAuth return path "${oauthReturnPath}" must be a same-origin path starting with "/".`,
    });
  } else if (!ALLOWED_OAUTH_RETURN_PATHS.includes(oauthReturnPath)) {
    issues.push({
      field: "oauthReturnPath",
      message: `OAuth return path "${oauthReturnPath}" is not in the sign-in allow-list (${ALLOWED_OAUTH_RETURN_PATHS.join(", ")}). Add it in the backend auth settings or pick an allowed path.`,
    });
  }

  if (!isSafeRelativePath(afterLogin)) {
    issues.push({
      field: "afterLogin",
      message: `Post-login path "${afterLogin}" must be a same-origin path starting with "/".`,
    });
  } else if (!ALLOWED_AFTER_LOGIN_PATHS.includes(afterLogin)) {
    issues.push({
      field: "afterLogin",
      message: `Post-login path "${afterLogin}" is not a known app route (${ALLOWED_AFTER_LOGIN_PATHS.join(", ")}).`,
    });
  }

  if (origin && brand.hosts.length > 0) {
    try {
      const host = new URL(origin).hostname.toLowerCase();
      const isLocal = host === "localhost" || host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com");
      if (!isLocal && !brand.hosts.includes(host)) {
        issues.push({
          field: "host",
          message: `This brand is served from "${host}", which is not one of its configured hostnames (${brand.hosts.join(", ")}).`,
        });
      }
    } catch {
      /* ignore unparsable origins */
    }
  }

  return issues;
}

/**
 * Validates a single redirect path as it is typed in the admin console.
 * Returns `null` when the path is a known allowed route for this tenant.
 */
export function checkRedirectPath(
  field: "afterLogin" | "oauthReturnPath",
  value: string,
): { message: string; suggestion: string | null } | null {
  const allowed =
    field === "afterLogin" ? ALLOWED_AFTER_LOGIN_PATHS : ALLOWED_OAUTH_RETURN_PATHS;
  const label = field === "afterLogin" ? "Post-login path" : "OAuth return path";
  const path = value.trim();

  if (path === "") return { message: `${label} is required.`, suggestion: allowed[0] ?? "/" };
  if (!isSafeRelativePath(path)) {
    return {
      message: `${label} must be a same-origin path starting with "/" — no absolute or protocol-relative URLs.`,
      suggestion: nearestAllowedPath(path, allowed),
    };
  }
  if (allowed.includes(path)) return null;

  return {
    message:
      field === "afterLogin"
        ? `"${path}" is not one of this tenant's allowed routes (${allowed.join(", ")}). Signed-in users would land on a 404.`
        : `"${path}" is not in the sign-in redirect allow-list (${allowed.join(", ")}). OAuth would bounce back to the home page.`,
    suggestion: nearestAllowedPath(path, allowed),
  };
}

/** Best-effort "did you mean" suggestion by prefix / substring similarity. */
function nearestAllowedPath(value: string, allowed: string[]): string | null {
  const needle = value.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  if (!needle) return allowed[0] ?? null;
  const match = allowed.find((p) => {
    const candidate = p.toLowerCase().replace(/^\/+|\/+$/g, "");
    return candidate !== "" && (candidate.startsWith(needle) || needle.startsWith(candidate));
  });
  return match ?? null;
}

/** Full URL handed to Supabase as the OAuth `redirect_uri`. */
export function brandOAuthRedirectUrl(brand: BrandConfig, origin: string): string {
  const path = isSafeRelativePath(brand.redirect.oauthReturnPath)
    ? brand.redirect.oauthReturnPath
    : "/";
  return new URL(path, origin).toString();
}

