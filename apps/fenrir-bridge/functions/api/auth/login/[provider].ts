import { noStoreJson } from "../../../_lib/responses";

// MyFenrir sign-in is Supabase Auth, started client-side by the SPA
// (signInWithOAuth). This server route only exists because old links and
// cached bundles may still hit /api/auth/login/<provider>; it forwards the
// visitor to the login screen instead of dead-ending.
const knownProviders = new Set(["google", "microsoft", "apple"]);

export const onRequestGet: PagesFunction = async (context) => {
  const provider = String(context.params.provider ?? "");
  if (!knownProviders.has(provider)) {
    return noStoreJson({ ok: false, error: "unsupported_provider" }, { status: 404 });
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/login",
      "Cache-Control": "no-store"
    }
  });
};
