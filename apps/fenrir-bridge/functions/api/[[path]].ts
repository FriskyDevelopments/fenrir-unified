import { noStoreJson } from "../_lib/responses";
import { createFallbackChallenge, createVerificationGrant, riskLevel, verifyFallbackChallenge } from "../_lib/verification";

export async function onRequest(context: any) {
  const url = new URL(context.request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = context.request.method.toUpperCase();

  // Restore Telegram identity link if this catch-all won the /api/* match.
  // App identity stays fenrir_session / AUTH Worker. Do not touch VC bot webhooks.
  if (path === "/api/telegram/link/start" && method === "GET") {
    const { onRequestGet } = await import("./telegram/link/start");
    return onRequestGet(context);
  }
  if (path === "/api/telegram/link/start" && method === "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
  }
  if (path === "/api/telegram/link") {
    if (method === "HEAD") {
      return new Response(null, { status: 405, headers: { Allow: "GET, POST", "Cache-Control": "no-store" } });
    }
    const link = await import("./telegram/link");
    if (method === "GET") return link.onRequestGet(context);
    if (method === "POST") return link.onRequestPost(context);
  }

  // Cloudflare Pages lets this optional catch-all own /api/* on this project.
  if (url.pathname === "/api/verification/challenge" && context.request.method === "GET") {
    const mode = url.searchParams.get("mode");
    try {
      if (mode === "slider" || mode === "puzzle") return noStoreJson(await createFallbackChallenge(mode, context.env, riskLevel(context.request)));
      return noStoreJson({ error: "verification_mode_invalid" }, { status: 400 });
    } catch (error) {
      console.error("verification challenge failed", error);
      return noStoreJson({ error: "verification_unavailable" }, { status: 503 });
    }
  }
  if (url.pathname === "/api/verification/verify" && context.request.method === "POST") {
    const body = await context.request.json().catch(() => null) as Record<string, unknown> | null;
    const mode = body?.mode;
    try {
      const verified = (mode === "slider" || mode === "puzzle") && await verifyFallbackChallenge({ mode, token: body?.token, value: body?.value, answer: body?.answer }, context.env);
      if (!verified) return noStoreJson({ verified: false, error: "verification_failed" }, { status: 400 });
      return noStoreJson({ verified: true, grant: await createVerificationGrant(context.env) });
    } catch (error) {
      console.error("verification check failed", error);
      return noStoreJson({ verified: false, error: "verification_unavailable" }, { status: 503 });
    }
  }
  if (url.pathname === "/api/verification/grant" && context.request.method === "POST") {
    const body = await context.request.json().catch(() => null) as { grant?: unknown; context?: unknown } | null;
    if (typeof body?.grant !== "string" || typeof body.context !== "string") {
      return noStoreJson({ verified: false, error: "verification_grant_invalid" }, { status: 400 });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    let response: Response | null = null;
    try {
      response = await fetch("https://friskydev-human-verification.hrgrrtks2p.workers.dev/api/grant/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant: body.grant, context: body.context, audience: url.origin }),
        signal: controller.signal
      });
    } catch {
      response = null;
    } finally {
      clearTimeout(timer);
    }
    if (!response?.ok) return noStoreJson({ verified: false, error: "verification_grant_rejected" }, { status: 400 });
    const result = await response.json().catch(() => null) as { verified?: boolean; method?: string } | null;
    if (!result?.verified) return noStoreJson({ verified: false, error: "verification_grant_rejected" }, { status: 400 });
    return noStoreJson({ verified: true, method: result.method });
  }
  return noStoreJson(
    {
      ok: false,
      error: "api_route_not_found",
      path: url.pathname,
      source: "fenrir-bridge-pages-functions"
    },
    { status: 404 }
  );
}
