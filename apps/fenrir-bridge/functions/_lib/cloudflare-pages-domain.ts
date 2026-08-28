import type { BillingEnv } from "./billing-env";

const DEFAULT_ACCOUNT_ID = "e2a7eccb24c4836847fd14d08c499bd0";
const DEFAULT_PAGES_PROJECT = "fenrir-bridge";

const RESERVED_HOSTS = new Set([
  "myfenrir.com",
  "www.myfenrir.com",
  "bridge.myfenrir.com",
  "auth.myfenrir.com"
]);

type CfError = { code?: number; message?: string };
type CfEnvelope<T> = { success?: boolean; result?: T; errors?: CfError[]; messages?: CfError[] };

export type CfZone = {
  id: string;
  name: string;
  status: string;
  name_servers?: string[];
  account?: { id?: string };
};

export type CfPagesDomain = {
  id?: string;
  name?: string;
  status?: string;
  verification_data?: { status?: string };
  validation_data?: { status?: string };
};

export function pagesProject(env: BillingEnv) {
  return env.CLOUDFLARE_PAGES_PROJECT?.trim() || DEFAULT_PAGES_PROJECT;
}

export function accountId(env: BillingEnv) {
  return env.CLOUDFLARE_ACCOUNT_ID?.trim() || DEFAULT_ACCOUNT_ID;
}

export function connectToken(env: BillingEnv) {
  return env.CLOUDFLARE_API_TOKEN?.trim() || "";
}

export function isPublicHostname(host: string) {
  if (!host || host.length > 253) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (host.endsWith(".workers.dev") || host.endsWith(".pages.dev")) return false;
  if (!host.includes(".")) return false;
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host)) return false;
  return true;
}

export function isReservedFenrirHost(host: string) {
  return RESERVED_HOSTS.has(host);
}

async function cf<T>(token: string, path: string, init?: RequestInit): Promise<CfEnvelope<T>> {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const body = (await response.json().catch(() => null)) as CfEnvelope<T> | null;
  if (!body) {
    return { success: false, errors: [{ message: `cloudflare_http_${response.status}` }] };
  }
  return body;
}

function cfMessage(body: CfEnvelope<unknown>, fallback: string) {
  return body.errors?.[0]?.message || body.messages?.[0]?.message || fallback;
}

export async function findZoneOnAccount(token: string, acct: string, hostname: string) {
  const labels = hostname.split(".").filter(Boolean);
  while (labels.length >= 2) {
    const name = labels.join(".");
    const body = await cf<CfZone[]>(token, `/zones?name=${encodeURIComponent(name)}&account.id=${encodeURIComponent(acct)}&status=active`);
    const zone = body.result?.[0];
    if (zone?.id) return zone;
    labels.shift();
  }
  return null;
}

export async function getPagesDomain(token: string, acct: string, project: string, hostname: string) {
  const body = await cf<CfPagesDomain>(
    token,
    `/accounts/${encodeURIComponent(acct)}/pages/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(hostname)}`
  );
  if (body.success && body.result) return body.result;
  return null;
}

export async function attachPagesDomain(token: string, acct: string, project: string, hostname: string) {
  const existing = await getPagesDomain(token, acct, project, hostname);
  if (existing) return { ok: true as const, domain: existing, created: false };

  const body = await cf<CfPagesDomain>(
    token,
    `/accounts/${encodeURIComponent(acct)}/pages/projects/${encodeURIComponent(project)}/domains`,
    { method: "POST", body: JSON.stringify({ name: hostname }) }
  );

  if (body.success && body.result) return { ok: true as const, domain: body.result, created: true };

  const message = cfMessage(body, "pages_domain_attach_failed");
  if (/already exists|already been added|81007|8000007/i.test(message)) {
    const again = await getPagesDomain(token, acct, project, hostname);
    if (again) return { ok: true as const, domain: again, created: false };
  }

  return { ok: false as const, error: message };
}

export function mapCertificateStatus(pagesDomain: CfPagesDomain | null) {
  const status = (pagesDomain?.status || pagesDomain?.validation_data?.status || "").toLowerCase();
  if (status === "active") return { status: "verified", certificateStatus: "active" };
  if (status === "deactivated" || status === "error") return { status: "failed", certificateStatus: status };
  return { status: "pending", certificateStatus: status || "pending" };
}
