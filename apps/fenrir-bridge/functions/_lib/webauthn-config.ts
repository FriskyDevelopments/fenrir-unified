import { siteOrigin, type BillingEnv } from "./billing-env";

function hostnameFromPublicSite(env: BillingEnv): string | null {
  const raw = env.PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

export function webauthnRpConfig(request: Request, env: BillingEnv) {
  const url = new URL(request.url);
  const origin = siteOrigin(request, env);
  const fromEnv = hostnameFromPublicSite(env);
  let rpID = fromEnv ?? url.hostname;
  if (url.hostname === "127.0.0.1") rpID = "localhost";
  return {
    rpName: "Fenrir Bridge",
    rpID,
    origin
  };
}
