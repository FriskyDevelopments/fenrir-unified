// Central WorkOS config. Reads from several common env var names so the app
// works on first deploy regardless of how the Vercel project env is named, and
// falls back to the proven-valid client id / registered redirect so the
// "Invalid client ID" failure is fixed even if env is empty.
function env(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  return "";
}

export const CLIENT_ID =
  env("WORKOS_CLIENT_ID", "NEXT_PUBLIC_WORKOS_CLIENT_ID", "WORKOS_PROJECT_ID") ||
  "client_01KT7NWYWB256XP0V00PX1YW01";

export const REDIRECT_URI =
  env("WORKOS_REDIRECT_URI", "NEXT_PUBLIC_WORKOS_REDIRECT_URI", "WORKOS_REDIRECT_URL") ||
  "https://login.myfenrir.com/auth/callback";

// API key (client secret) is required only for the post-sign-in code exchange.
export const API_KEY = env(
  "WORKOS_API_KEY",
  "WORKOS_SECRET",
  "WORKOS_API_SECRET",
  "WORKOS_CLIENT_SECRET"
);

export const PROVIDER_MAP: Record<string, string> = {
  google: "GoogleOAuth",
  microsoft: "MicrosoftOAuth",
  apple: "AppleOAuth",
  authkit: "authkit",
};

export function authorizeUrl(provider: string) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    provider: PROVIDER_MAP[provider] || "authkit",
  });
  return `https://api.workos.com/user_management/authorize?${params.toString()}`;
}
