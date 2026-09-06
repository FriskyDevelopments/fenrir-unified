import type { ProviderId } from "@/config/brands";

// Reject URL-parser normalization characters, including controls and spaces.
// eslint-disable-next-line no-control-regex
const unsafeRedirectCharacters = /[\\\u0000-\u0020]/;

/** Keep post-login navigation on this Community host and out of auth loops. */
export function safeCommunityNext(next: unknown): string | null {
  if (
    typeof next !== "string" ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    unsafeRedirectCharacters.test(next)
  )
    return null;
  try {
    const target = new URL(next, "https://community.invalid");
    const pathname = decodeURIComponent(target.pathname).toLowerCase();
    if (target.origin !== "https://community.invalid" || unsafeRedirectCharacters.test(pathname))
      return null;
    if (
      pathname === "/login" ||
      pathname.startsWith("/login/") ||
      pathname === "/auth" ||
      pathname.startsWith("/auth/") ||
      pathname === "/api/auth" ||
      pathname.startsWith("/api/auth/")
    )
      return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

export function communityLoginPath(input: {
  nextPath?: string;
  brandId?: string;
  gateSlug?: string;
}) {
  const query = new URLSearchParams({ next: safeCommunityNext(input.nextPath) ?? "/dashboard" });
  if (input.brandId) query.set("brand", input.brandId);
  if (input.gateSlug) query.set("gate", input.gateSlug);
  return `/login?${query.toString()}`;
}

export function communityOAuthRedirectUrl(input: {
  communityOrigin: string;
  nextPath: string;
  brandId: string;
  gateSlug?: string;
}) {
  return new URL(communityLoginPath(input), input.communityOrigin).toString();
}

type CommunityOAuthClient = {
  signInWithOAuth: (input: {
    provider: "apple" | "google" | "azure";
    options: { redirectTo: string; skipBrowserRedirect: true; scopes?: string };
  }) => Promise<{ data: { url: string | null }; error: { message: string } | null }>;
};

/** The existing Community Supabase client owns callback/session persistence. */
export async function startCommunityOAuth(
  auth: CommunityOAuthClient,
  input: {
    provider: ProviderId;
    communityOrigin: string;
    nextPath: string;
    brandId: string;
    gateSlug?: string;
  },
): Promise<string> {
  const { data, error } = await auth.signInWithOAuth({
    provider: input.provider === "microsoft" ? "azure" : input.provider,
    options: {
      redirectTo: communityOAuthRedirectUrl(input),
      skipBrowserRedirect: true,
      ...(input.provider === "microsoft" ? { scopes: "email" } : {}),
    },
  });
  if (error) throw new Error(error.message);
  if (!data.url) throw new Error("Could not start Community sign-in. Please try again.");
  return data.url;
}

/** Public provider capabilities from the same project that owns Community sessions. */
export async function loadCommunityProviders(
  configuration: { supabaseUrl: string; publishableKey: string },
  fetcher: typeof fetch = fetch,
): Promise<ProviderId[]> {
  const response = await fetcher(
    `${configuration.supabaseUrl.replace(/\/+$/, "")}/auth/v1/settings`,
    {
      credentials: "omit",
      headers: { Accept: "application/json", apikey: configuration.publishableKey },
    },
  );
  const body = (await response.json().catch(() => null)) as {
    external?: Record<string, unknown>;
  } | null;
  if (
    !response.ok ||
    !body?.external ||
    typeof body.external !== "object" ||
    Array.isArray(body.external)
  )
    return [];
  return (["apple", "google", "microsoft"] as const).filter(
    (provider) => body.external?.[provider === "microsoft" ? "azure" : provider] === true,
  );
}

export function availableBrandProviders(
  brandProviders: ProviderId[],
  enabledProviders: ProviderId[],
) {
  const enabled = new Set(enabledProviders);
  return brandProviders.filter((provider) => enabled.has(provider));
}
