import type { PaidPlan } from "../services/api";
import { managedDashboardPath, pageKeys, type PageKey } from "./shared";

export const dashboardPageAliases: Record<string, PageKey> = {
  main: "command",
  command: "command",
  links: "links",
  "all-links": "links",
  vaults: "links",
  domains: "domains",
  dns: "dns",
  "dns-wizard": "dns",
  locks: "locks",
  "telegram-locks": "locks",
  rooms: "rooms",
  "live-rooms": "rooms",
  telegram: "telegram",
  revocations: "revocations",
  audit: "audit",
  faq: "faq",
  faqs: "faq",
  billing: "billing",
  brands: "brands",
  "community-brands": "brands",
  "neon-nexus": "brands"
};

export function isAuthCallbackPath(pathname: string) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return normalizedPath === "/auth/callback" ||
         normalizedPath === "/auth/v1/callback" ||
         normalizedPath === "/login" ||
         normalizedPath === (import.meta.env.VITE_AUTH_REDIRECT_PATH || "/auth/callback");
}

export function activePageFromLocation(path: string, hash: string): PageKey {
  const routeKey = path.replace(/^\/+|\/+$/g, "");
  const hashKey = hash.replace(/^#\/?/, "").replace(/^\/+|\/+$/g, "");
  const key = routeKey || hashKey;
  if (path.startsWith("/admin")) return "locks";
  if (path.startsWith("/portal")) return "links";
  if (isAuthCallbackPath(path)) return "command";
  return dashboardPageAliases[key] ?? "command";
}

export function dashboardPathFor(page: PageKey) {
  return page === "command" ? managedDashboardPath : `/${page}`;
}

export function paidPlanFromProductLabel(label: string): PaidPlan | null {
  const p = label.trim().toLowerCase();
  if (p === "starter") return "starter";
  if (p === "pro") return "pro";
  if (p === "operator") return "operator";
  return null;
}
