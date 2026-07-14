// Cloudflare zone client for the DNS Wizard's "Switch DNS to Cloudflare" flow.
//
// Feature: move a customer domain's DNS to Cloudflare so the Telegram Lock URLs
// (join.customer-domain.com) get an automatic Universal SSL certificate. The old
// wizard only ever showed placeholder "Cloudflare assigned nameservers" and never
// talked to the Cloudflare API — so cloudflare_nameservers stayed NULL and the
// admin had nothing real to paste at their registrar. This creates/identifies the
// real zone, returns the two assigned nameservers, and lets the wizard poll until
// the zone is active and the certificate is issued.
//
// SECURITY: the API token and account id come ONLY from the server environment
// (Cloudflare Pages secrets, sourced from the Secret Center / 1Password). They are
// never hardcoded and never sent to the browser. When they are absent the flow
// self-reports "not configured" and the wizard stays in manual-instructions mode,
// exactly like the Wert card path is gated dark until its keys land.

export type CloudflareDnsEnv = {
  /** Cloudflare API token with Zone:Read + Zone:Edit (create zone) + DNS:Edit. */
  CLOUDFLARE_API_TOKEN?: string;
  /** Cloudflare account id the new zones are created under. */
  CLOUDFLARE_ACCOUNT_ID?: string;
};

const CF_API = 'https://api.cloudflare.com/client/v4';

export function cloudflareConfigured(env: CloudflareDnsEnv): boolean {
  return Boolean(env.CLOUDFLARE_API_TOKEN?.trim() && env.CLOUDFLARE_ACCOUNT_ID?.trim());
}

// Two-level public suffixes we care about, so join.brand.co.uk resolves its zone
// to brand.co.uk (not co.uk). Not a full PSL — kept deliberately small and robust;
// the vast majority of Fenrir customers are on single-label TLDs.
const TWO_LEVEL_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'gov.uk',
  'ac.uk',
  'me.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.nz',
  'com.mx',
  'com.br',
  'com.ar',
  'co.jp',
  'co.in',
  'co.za',
]);

/** Registrable apex for a (possibly sub-)domain — the name a Cloudflare zone uses. */
export function registrableApex(domain: string): string {
  const labels = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '')
    .split('.')
    .filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  if (TWO_LEVEL_SUFFIXES.has(lastTwo)) return labels.slice(-3).join('.');
  return lastTwo;
}

export type CfZone = {
  id: string;
  name: string;
  status: string; // 'pending' | 'active' | 'initializing' | 'moved' | ...
  name_servers?: string[];
};

type CfResponse<T> = {
  ok: boolean;
  status: number;
  result?: T;
  errors?: Array<{ code?: number; message?: string }>;
};

async function cfFetch<T>(
  env: CloudflareDnsEnv,
  path: string,
  init: RequestInit = {}
): Promise<CfResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${CF_API}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        'content-type': 'application/json',
        accept: 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const data = (await res.json().catch(() => null)) as {
      success?: boolean;
      result?: T;
      errors?: Array<{ code?: number; message?: string }>;
    } | null;
    return {
      ok: res.ok && Boolean(data?.success),
      status: res.status,
      result: data?.result,
      errors: data?.errors,
    };
  } catch {
    return { ok: false, status: 0, errors: [{ message: 'cloudflare_unreachable' }] };
  } finally {
    clearTimeout(timer);
  }
}

export function cfErrorMessage(errors?: Array<{ message?: string }>): string {
  const first = errors?.find((e) => e.message)?.message;
  return first || 'Cloudflare request failed.';
}

/** Find an existing zone by apex name (already added to the Cloudflare account). */
export async function findZone(env: CloudflareDnsEnv, apex: string): Promise<CfZone | null> {
  const res = await cfFetch<CfZone[]>(
    env,
    `/zones?name=${encodeURIComponent(apex)}&account.id=${encodeURIComponent(
      env.CLOUDFLARE_ACCOUNT_ID!
    )}&per_page=1`
  );
  if (res.ok && res.result && res.result.length > 0) return res.result[0];
  return null;
}

/** Create a full-setup zone (registrar keeps the domain; we take over DNS). */
export async function createZone(
  env: CloudflareDnsEnv,
  apex: string
): Promise<CfResponse<CfZone>> {
  return cfFetch<CfZone>(env, '/zones', {
    method: 'POST',
    body: JSON.stringify({
      name: apex,
      account: { id: env.CLOUDFLARE_ACCOUNT_ID },
      type: 'full',
    }),
  });
}

export async function getZone(env: CloudflareDnsEnv, zoneId: string): Promise<CfResponse<CfZone>> {
  return cfFetch<CfZone>(env, `/zones/${encodeURIComponent(zoneId)}`);
}

// Universal SSL certificate status for the zone. Returns 'active' once at least
// one certificate pack is issued/active, else 'issuing' while pending, or null if
// the endpoint is unavailable (older plans / permissions) — callers then fall back
// to the zone's own active state as the SSL proxy.
export async function universalSslActive(
  env: CloudflareDnsEnv,
  zoneId: string
): Promise<'active' | 'issuing' | null> {
  const res = await cfFetch<Array<{ certificate_status?: string }>>(
    env,
    `/zones/${encodeURIComponent(zoneId)}/ssl/verification`
  );
  if (!res.ok || !Array.isArray(res.result)) return null;
  if (res.result.length === 0) return 'issuing';
  const anyActive = res.result.some((c) => c.certificate_status === 'active');
  return anyActive ? 'active' : 'issuing';
}
