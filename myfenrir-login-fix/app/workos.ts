// Central WorkOS config. The valid client id is used as a fallback so the
// "Invalid client ID" failure is fixed even if the project env is not set.
export const CLIENT_ID =
  process.env.WORKOS_CLIENT_ID?.trim() || "client_01KT7NWYWB256XP0V00PX1YW01";

export const REDIRECT_URI =
  process.env.WORKOS_REDIRECT_URI?.trim() ||
  "https://login.myfenrir.com/auth/callback";

// API key is required only for the post-sign-in code exchange. Read from env.
export const API_KEY = process.env.WORKOS_API_KEY?.trim() || "";

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
