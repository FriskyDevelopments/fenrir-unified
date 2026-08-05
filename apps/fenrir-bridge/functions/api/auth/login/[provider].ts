import { noStoreJson } from "../../../_lib/responses";
import { safeReturnPath, type WorkOSEnv } from "../../../_lib/workos";
import { authOrigin } from "../../../_lib/billing-env";

// MyFenrir identity is WorkOS-only.
//
// This route used to open a *direct* OAuth transaction against Google,
// Microsoft and Apple with per-provider client IDs, running in parallel with
// the WorkOS path on the same host. Two live stacks behind one login screen is
// what kept re-breaking sign-in: a fix applied to one stack left the other one
// still answering, and the direct callbacks also wrote identities into the
// Supabase project shared with clipsflow.tech. Supabase belongs to FriskyDev;
// Community/MyFenrir is WorkOS for identity and Neon for data.
//
// The path is kept rather than deleted so already-issued links and any cached
// bundle keep working, but it can no longer reach an identity provider on its
// own — it only forwards into WorkOS.
const workosProviderHints = new Set(["google", "microsoft", "apple"]);

export const onRequestGet: PagesFunction<WorkOSEnv> = async (context) => {
  const provider = String(context.params.provider ?? "");
  if (provider !== "workos" && !workosProviderHints.has(provider)) {
    return noStoreJson({ ok: false, error: "unsupported_provider" }, { status: 404 });
  }

  const requestUrl = new URL(context.request.url);
  const target = new URL(`${authOrigin(context.request, context.env)}/api/auth/workos/login`);
  if (workosProviderHints.has(provider)) {
    target.searchParams.set("provider", provider);
  }
  target.searchParams.set("return_to", safeReturnPath(requestUrl.searchParams.get("return_to")));

  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      "Cache-Control": "no-store"
    }
  });
};
