import type { FriskyDomain } from "./types";

async function connectRequest(path: string, data?: object, signal?: AbortSignal) {
  const response = await fetch(path, { method: data ? "POST" : "GET", credentials: "same-origin", signal,
    headers: { accept: "application/json", ...(data ? { "Content-Type": "application/json" } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}) });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true) throw new Error(typeof body?.error === "string" ? body.error : "domain_setup_unavailable");
  return body;
}

export async function fetchDomainCapabilities(signal?: AbortSignal): Promise<boolean> {
  const body = await connectRequest("/api/domains/capabilities", undefined, signal);
  return body.canConnect === true && body.requiresOwnershipProof === true;
}

export async function connectDomain(input: { domain: string } | { domainId: string }): Promise<FriskyDomain> {
  const body = await connectRequest("domainId" in input ? "/api/domains/check" : "/api/domains", input);
  if (!body.data || typeof body.data.id !== "string" || typeof body.data.domain !== "string" || typeof body.data.status !== "string" || typeof body.data.certificateStatus !== "string") throw new Error("domain_setup_unavailable");
  return body.data;
}
