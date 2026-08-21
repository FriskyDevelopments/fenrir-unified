import { noStoreJson } from "../_lib/responses";
import { onRequestGet as altchaChallenge } from "./altcha/challenge";
import { onRequestPost as altchaVerify } from "./altcha/verify";
import { createAltchaChallenge, verifyAltchaPayload } from "../_lib/altcha";
import { createFallbackChallenge, createVerificationGrant, riskLevel, verifyFallbackChallenge } from "../_lib/verification";

export async function onRequest(context: any) {
  const url = new URL(context.request.url);
  // Cloudflare Pages lets this optional catch-all own /api/* on this project.
  // Route ALTCHA explicitly so the human-verification gate reaches its real
  // challenge and verification handlers rather than the generic 404.
  if (url.pathname === "/api/altcha/challenge" && context.request.method === "GET") {
    return altchaChallenge(context);
  }
  if (url.pathname === "/api/altcha/verify" && context.request.method === "POST") {
    return altchaVerify(context);
  }
  if (url.pathname === "/api/verification/challenge" && context.request.method === "GET") {
    const mode = url.searchParams.get("mode");
    try {
      if (mode === "altcha") return noStoreJson(await createAltchaChallenge(context.env));
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
      const verified = mode === "altcha"
        ? typeof body?.payload === "string" && await verifyAltchaPayload(body.payload, context.env)
        : (mode === "slider" || mode === "puzzle") && await verifyFallbackChallenge({ mode, token: body?.token, value: body?.value, answer: body?.answer }, context.env);
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
    const response = await fetch("https://friskydev-human-verification.hrgrrtks2p.workers.dev/api/grant/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant: body.grant, context: body.context, audience: url.origin }),
    }).catch(() => null);
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
