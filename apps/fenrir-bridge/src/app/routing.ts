import type { PaidPlan } from "../services/api";
import { managedDashboardPath, pageKeys, type PageKey } from "./shared";

export const dashboardPageAliases: Record<string, PageKey> = {
  main: "command",
  command: "command",
  links: "command",
  "all-links": "command",
  vaults: "command",
  domains: "domains",
  dns: "domains",
  "dns-wizard": "domains",
  locks: "locks",
  gates: "locks",
  "telegram-locks": "locks",
  rooms: "rooms",
  "live-rooms": "rooms",
  telegram: "telegram",
  revocations: "audit",
  audit: "audit",
  faq: "command",
  faqs: "command",
  billing: "billing",
  brands: "locks",
  "community-brands": "locks",
  "neon-nexus": "locks"
};

export function isAuthCallbackPath(pathname: string) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return normalizedPath === "/auth/callback" ||
         normalizedPath === "/auth/v1/callback" ||
         normalizedPath === (import.meta.env.VITE_AUTH_REDIRECT_PATH || "/auth/callback");
}

export function activePageFromLocation(path: string, hash: string): PageKey {
  const routeKey = path.replace(/^\/+|\/+$/g, "");
  const hashKey = hash.replace(/^#\/?/, "").replace(/^\/+|\/+$/g, "");
  const key = routeKey || hashKey;
  if (path.startsWith("/admin")) return "locks";
  if (path.startsWith("/portal")) return "command";
  if (isAuthCallbackPath(path)) return "command";
  return dashboardPageAliases[key] ?? "command";
}

export function dashboardPathFor(page: PageKey) {
  return page === "command" ? managedDashboardPath : `/${page}`;
}

export function paidPlanFromProductLabel(label: string): PaidPlan | null {
  const p = label.trim().toLowerCase();
  // Legacy dashboard records still use the old internal keys.  The public
  // product has one paid plan, The Pack; map its label to the legacy paid key
  // only for backwards-compatible preview state.  Real purchase goes through
  // the Telegram Stars handoff, never the old card-plan endpoint.
  if (p === "the pack") return "operator";
  if (p === "starter") return "starter";
  if (p === "pro") return "pro";
  if (p === "operator") return "operator";
  return null;
}
