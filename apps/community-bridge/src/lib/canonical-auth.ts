import type { ProviderId } from "@/config/brands";

export const CANONICAL_AUTH_ORIGIN = "https://www.myfenrir.com";

export function canonicalCommunityOAuthUrl(input: {
  provider: ProviderId;
  communityOrigin: string;
  nextPath: string;
  brandId: string;
  gateSlug?: string;
}) {
  const nextPath =
    input.nextPath.startsWith("/") && !input.nextPath.startsWith("//")
      ? input.nextPath
      : "/dashboard";
  const target = new URL(nextPath, input.communityOrigin);
  target.searchParams.set("brand", input.brandId);

  const handoff = new URL("/api/auth/community-sso", CANONICAL_AUTH_ORIGIN);
  handoff.searchParams.set("next", target.toString());
  handoff.searchParams.set("brand", input.brandId);
  if (input.gateSlug) handoff.searchParams.set("gate", input.gateSlug);

  // The direct OAuth return allow-list intentionally rejects /api/auth/*.
  // Returning through /main lets the signed-in App resume this one explicit
  // handoff while keeping arbitrary API paths out of OAuth return_to.
  const postAuth = new URL("/main", CANONICAL_AUTH_ORIGIN);
  postAuth.searchParams.set("next", `${handoff.pathname}${handoff.search}`);

  const login = new URL(`/api/auth/login/${input.provider}`, CANONICAL_AUTH_ORIGIN);
  login.searchParams.set("return_to", `${postAuth.pathname}${postAuth.search}`);
  return login.toString();
}

export async function loadCanonicalProviders(fetcher: typeof fetch = fetch): Promise<ProviderId[]> {
  const response = await fetcher(`${CANONICAL_AUTH_ORIGIN}/api/auth/providers`, {
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  const body = (await response.json().catch(() => null)) as { providers?: unknown } | null;
  if (!response.ok || !Array.isArray(body?.providers)) return [];
  return body.providers.filter(
    (provider): provider is ProviderId =>
      provider === "apple" || provider === "google" || provider === "microsoft",
  );
}

export function availableBrandProviders(
  brandProviders: ProviderId[],
  enabledProviders: ProviderId[],
) {
  const enabled = new Set(enabledProviders);
  return brandProviders.filter((provider) => enabled.has(provider));
}
