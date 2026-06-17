import type { FriskyCommissionLink, FriskyDomain, LiveRoomProvider } from "../services/types";

export const confettiPieces = Array.from({ length: 28 }, (_, index) => index);
export const pageKeys = ["command", "links", "domains", "dns", "locks", "rooms", "telegram", "revocations", "audit", "faq", "billing", "brands"] as const;
export const legalRoutes = new Set(["/legal", "/terms", "/privacy", "/acceptable-use"]);
export const friskySignalDevRequestUrl = "https://t.me/friskysignal";
export const liveRoomProviders: Array<{ id: LiveRoomProvider; name: string; icon: string; brand: string; hint: string; placeholder: string }> = [
  {
    id: "zoom",
    name: "Zoom",
    icon: "Z",
    brand: "Zoom",
    hint: "Zoom Rooms, webinars, client calls",
    placeholder: "https://zoom.us/j/..."
  },
  {
    id: "google_meet",
    name: "Google Meet",
    icon: "M",
    brand: "Google",
    hint: "Google Workspace calls and classes",
    placeholder: "https://meet.google.com/..."
  },
  {
    id: "whereby",
    name: "Whereby",
    icon: "W",
    brand: "Whereby",
    hint: "Simple browser rooms for customers",
    placeholder: "https://whereby.com/..."
  },
  {
    id: "webex",
    name: "Microsoft Teams",
    icon: "T",
    brand: "Teams",
    hint: "Teams calls, cohorts, and community events",
    placeholder: "https://teams.microsoft.com/l/meetup-join/..."
  },
  {
    id: "other",
    name: "Other room",
    icon: "+",
    brand: "Custom",
    hint: "Teams, Calendly, custom portals, etc.",
    placeholder: "https://your-room-link.example/..."
  }
];

export const domainTagPresets = ["launch", "client", "vip", "community", "paid", "internal"] as const;
export const domainSearchTlds = ["com", "io", "app", "dev", "ai"] as const;

export const providerLogoPresets: Record<LiveRoomProvider, string> = {
  zoom: "https://upload.wikimedia.org/wikipedia/commons/7/7b/Zoom_Communications_Logo.svg",
  google_meet: "https://upload.wikimedia.org/wikipedia/commons/9/9b/Google_Meet_icon_%282020%29.svg",
  whereby: "https://assets-global.website-files.com/5c45f12b43c3101f4504272f/5c45f12b43c3106a45042802_whereby-logo.svg",
  webex: "https://upload.wikimedia.org/wikipedia/commons/f/f9/Webex_by_Cisco_logo.svg",
  other: "/fenrir-splash-icon.svg"
};

export const twoFactorHelpLinks = {
  google: "https://myaccount.google.com/signinoptions/two-step-verification",
  microsoft: "https://account.microsoft.com/security",
  apple: "https://support.apple.com/102661"
} as const;

export function safeHttpUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function openSafeUrl(value: string) {
  return openAnyUrl(value);
}

export function openAnyUrl(value: string) {
  const target = absoluteUrl(value);
  if (!target) return false;
  window.open(target, "_blank", "noopener,noreferrer");
  return true;
}

export function absoluteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) {
    return new URL(trimmed, window.location.origin).toString();
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return safeHttpUrl(trimmed);
  }
  if (/^\S+\.\S+/.test(trimmed)) {
    return safeHttpUrl(`https://${trimmed}`);
  }
  try {
    const url = new URL(trimmed, window.location.origin);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function commissionUrlSlug(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const path = new URL(trimmed, window.location.origin).pathname;
    return path.replace(/^\/+|\/+$/g, "").split("/").pop() ?? "";
  } catch {
    return "";
  }
}

export function findCommissionLink(links: FriskyCommissionLink[] = [], slug: string) {
  const target = slug.trim().toLowerCase();
  return links.find((link) => {
    if (link.id.toLowerCase() === target) return true;
    if (commissionUrlSlug(link.url).toLowerCase() === target) return true;
    return false;
  }) ?? null;
}

export function commissionFallbackBySlug(slug: string) {
  const target = slug.trim().toLowerCase();
  if (!target) return "";
  const map: Record<string, string> = {
    dynadot: "https://www.dynadot.com/",
    "dynadot-auctions": "https://www.dynadot.com/domains/auctions/",
    "cj-dynadot": "https://www.dynadot.com/register/domains/search",
    cloudflare: "https://www.cloudflare.com/",
    porkbun: "https://porkbun.com/",
    namecheap: "https://www.namecheap.com/"
  };
  return map[target] ?? "";
}

export function resolveCommissionDestination(link: FriskyCommissionLink | null, slug: string) {
  if (link) {
    const direct = absoluteUrl(link.url);
    if (direct) return direct;
    const linkSlug = commissionUrlSlug(link.url);
    const fallbackFromLink = commissionFallbackBySlug(linkSlug);
    if (fallbackFromLink) return fallbackFromLink;
  }
  return commissionFallbackBySlug(slug);
}

export function trustedFenrirImageUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("/api/media/proxy?")) return trimmed;
  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.origin === window.location.origin && url.pathname.startsWith("/api/media/proxy")) {
      return `${url.pathname}${url.search}`;
    }
    if (url.protocol === "https:") return url.toString();
  } catch {
    return "";
  }
  return "";
}

export function parseDomainTags(value: string) {
  const tags = value
    .split(/[,\s]+/)
    .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index)
    .slice(0, 8);
  return tags.length ? tags : ["launch"];
}

export function addDomainTag(value: string, tag: string) {
  return parseDomainTags(`${value}, ${tag}`).join(", ");
}

export function defaultDomainTags(domain: FriskyDomain) {
  const tags: string[] = [domain.status, domain.dnsProvider];
  if (domain.certificateStatus === "active") tags.push("ssl");
  if (domain.domain.includes("myfenrir")) tags.push("primary");
  return tags;
}

export type DomainSearchResult = {
  domain: string;
  status: "ready" | "dns_found" | "no_dns_signal" | "invalid" | "error";
  summary: string;
  records: string[];
};

export function cleanDomainSearchBase(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/^\.+|\.+$/g, "");
}

export function domainSearchCandidates(value: string) {
  const base = cleanDomainSearchBase(value);
  if (!base) return [];
  if (base.includes(".")) return [base];
  return domainSearchTlds.map((tld) => `${base}.${tld}`);
}

export async function lookupDomainDns(domain: string): Promise<DomainSearchResult> {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)) {
    return { domain, status: "invalid", summary: "Use a valid domain name.", records: [] };
  }
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2800);
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`, {
      headers: { accept: "application/dns-json" },
      signal: controller.signal
    });
    window.clearTimeout(timeout);
    if (!response.ok) throw new Error("dns_lookup_failed");
    const payload = (await response.json().catch(() => null)) as { Status?: number; Answer?: Array<{ data?: string }> } | null;
    const records = (payload?.Answer ?? []).map((answer) => String(answer.data ?? "").replace(/\.$/, "")).filter(Boolean).slice(0, 3);
    if (records.length) {
      return {
        domain,
        status: "dns_found",
        summary: "DNS exists. Treat as owned or already configured.",
        records
      };
    }
    return {
      domain,
      status: "no_dns_signal",
      summary: "No NS signal found. Check registrar availability next.",
      records: []
    };
  } catch {
    return { domain, status: "error", summary: "Live DNS lookup timed out. Check registrar availability directly.", records: [] };
  }
}

export const defaultServiceOrg = (import.meta.env.VITE_DEFAULT_SERVICE_ORG ?? "Frisky Dev Workspace").trim();
export const defaultServiceSubdomain = (import.meta.env.VITE_DEFAULT_SERVICE_SUBDOMAIN ?? "vip.myfenrir.com").trim();
export const managedDashboardPath = "/main";
export const telegramLoginBotUsername = (
  import.meta.env.VITE_FENRIR_TELEGRAM_BOT_USERNAME ??
  import.meta.env.VITE_MYFENRIR_TELEGRAM_BOT_USERNAME ??
  ""
).replace(/^@/, "").trim();
export const vercelPreviewWithoutApi = import.meta.env.VITE_VERCEL_API_MODE === "disabled";

export type PageKey = (typeof pageKeys)[number];
export type PersonalLink = {
  id: string;
  title: string;
  url: string;
  kind: "payment" | "docs" | "booking" | "support" | "other";
  status: "active" | "draft";
};
export type VaultLink = {
  id: string;
  title: string;
  url: string;
  kind: string;
  status: string;
};
export type FenrirRole = "owner" | "admin" | "user";
export type Celebration = {
  id: number;
  title: string;
  detail: string;
  tone: "dns" | "commerce";
};
