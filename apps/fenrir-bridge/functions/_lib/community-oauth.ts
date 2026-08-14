import {
  communityAuthConfigured,
  communityAuthNotConfigured,
  communitySessionSetCookie,
  communitySql,
  createCommunitySessionPayload,
  createCommunitySessionRecord,
  ensureCommunityBrandPayload,
  ensureCommunityMembershipForEmail,
  normalizeCommunitySlug,
  normalizeCommunitySlugOrThrow,
  requestClientIp,
  requestUserAgent,
  sha256Hex,
  signCommunitySession,
  siteOrigin,
  type CommunityAuthEnv
} from "./community-auth";
import {
  clearCommunityTransactionCookie,
  communityTransactionSetCookie,
  createCommunityOAuthTransaction,
  exchangeCodeForIdentity,
  getAuthorizationUrl,
  isCommunityOAuthProvider,
  isDirectOAuthAvailable,
  readCommunityOAuthTransaction,
  safeCommunityReturnPath,
  validateOAuthTransaction,
  type OAuthEnv,
  type OAuthIdentity,
  type OAuthProvider
} from "./oauth";

export type CommunityOAuthEnv = CommunityAuthEnv & OAuthEnv;

type CommunitySql = Awaited<ReturnType<typeof communitySql>>;

export type CommunityOAuthDeps = {
  communitySql?: (env: CommunityAuthEnv) => Promise<CommunitySql>;
};

const defaultDeps: Required<CommunityOAuthDeps> = {
  communitySql
};

export function communityOAuthErrorLocation(origin: string, slug: string, error: string) {
  const params = new URLSearchParams({ auth_error: error });
  return `${origin.replace(/\/$/, "")}/community/${slug}?${params.toString()}`;
}

export async function handleCommunityOAuthStart(context: {
  request: Request;
  env: CommunityOAuthEnv;
  provider: string;
}) {
  if (!communityAuthConfigured(context.env)) return communityAuthNotConfigured();
  if (!isCommunityOAuthProvider(context.provider)) {
    return jsonError("unsupported_provider", 404);
  }

  const provider = context.provider as OAuthProvider;
  const requestUrl = new URL(context.request.url);
  const slug = normalizeCommunitySlug(requestUrl.searchParams.get("slug"));
  if (!slug) {
    return jsonError("invalid_community_slug", 400);
  }

  const origin = siteOrigin(context.request, context.env);

  if (!isDirectOAuthAvailable(provider, context.env)) {
    return redirect(communityOAuthErrorLocation(origin, slug, "provider_not_configured"));
  }

  try {
    const brand = await ensureCommunityBrandPayload(context.env, slug);
    if (!brand.enabled_auth_providers.includes(provider)) {
      return redirect(communityOAuthErrorLocation(origin, slug, "provider_not_enabled"));
    }

    const returnTo = safeCommunityReturnPath(
      requestUrl.searchParams.get("return_to") || `/community/${slug}`
    );
    const tx = await createCommunityOAuthTransaction(provider, context.env, {
      community: slug,
      returnTo
    });
    const callbackUri = `${origin}/api/community-auth/oauth/callback/${provider}`;
    const authUrl = await getAuthorizationUrl(provider, context.env, callbackUri, tx);

    return redirect(authUrl, {
      "Set-Cookie": await communityTransactionSetCookie(tx, context.env)
    });
  } catch (error) {
    console.error("Community OAuth start failed", error);
    const message = error instanceof Error ? error.message : "oauth_start_failed";
    return redirect(communityOAuthErrorLocation(origin, slug, message));
  }
}

export async function handleCommunityOAuthCallback(context: {
  request: Request;
  env: CommunityOAuthEnv;
  provider: string;
  deps?: CommunityOAuthDeps;
}) {
  if (!communityAuthConfigured(context.env)) return communityAuthNotConfigured();
  if (!isCommunityOAuthProvider(context.provider)) {
    return jsonError("unsupported_provider", 404);
  }

  const provider = context.provider as OAuthProvider;
  const origin = siteOrigin(context.request, context.env);
  const url = new URL(context.request.url);

  let code: string | null = null;
  let state: string | null = null;
  let providerError: string | null = null;

  if (context.request.method === "POST") {
    const formData = await context.request.formData();
    code = formData.get("code") as string | null;
    state = formData.get("state") as string | null;
    providerError = formData.get("error") as string | null;
  } else {
    code = url.searchParams.get("code");
    state = url.searchParams.get("state");
    providerError = url.searchParams.get("error");
  }

  const tx = await readCommunityOAuthTransaction(context.request, context.env);
  const slug = tx?.community ?? "unknown";

  if (providerError) {
    return redirectWithCommunityOAuthCleanup(origin, slug, providerError);
  }

  if (!code) {
    return redirectWithCommunityOAuthCleanup(origin, slug, "missing_code");
  }

  if (!isDirectOAuthAvailable(provider, context.env)) {
    return redirectWithCommunityOAuthCleanup(origin, slug, "provider_not_configured");
  }

  const callbackUri = `${origin}/api/community-auth/oauth/callback/${provider}`;

  try {
    validateOAuthTransaction(tx, provider, state);
    const identity = await exchangeCodeForIdentity(provider, context.env, code, callbackUri, tx!);
    const resolvedSlug = normalizeCommunitySlugOrThrow(tx!.community);
    const response = await finalizeCommunityOAuthSignIn({
      env: context.env,
      identity,
      slug: resolvedSlug,
      returnTo: tx!.returnTo,
      request: context.request,
      deps: context.deps
    });

    const headers = new Headers({
      Location: response.location,
      "Set-Cookie": response.cookie
    });
    headers.append("Set-Cookie", clearCommunityTransactionCookie());
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "oauth_callback_failed";
    return redirectWithCommunityOAuthCleanup(origin, slug, message);
  }
}

export async function finalizeCommunityOAuthSignIn(options: {
  env: CommunityOAuthEnv;
  identity: OAuthIdentity;
  slug: string;
  returnTo: string;
  request: Request;
  deps?: CommunityOAuthDeps;
}) {
  if (!options.identity.emailVerified) {
    throw new Error("email_unverified");
  }

  const deps = { ...defaultDeps, ...options.deps };
  const brand = await ensureCommunityBrandPayload(options.env, options.slug);
  if (!brand.enabled_auth_providers.includes(options.identity.provider)) {
    throw new Error("provider_not_enabled");
  }
  if (!brand.communityOrgId) {
    throw new Error("community_org_required");
  }

  const sql = await deps.communitySql(options.env);
  const email = options.identity.email.trim().toLowerCase();
  const { user, membership } = await ensureCommunityMembershipForEmail(sql, email, brand.communityOrgId);
  await upsertCommunityOAuthIdentity(sql, user.id, options.identity);

  const payload = createCommunitySessionPayload({
    userId: user.id,
    email: user.email,
    role: user.role,
    accessStatus: user.access_status,
    communitySlug: options.slug,
    communityOrgId: brand.communityOrgId
  });
  const session = await signCommunitySession(payload, options.env);
  const cookie = communitySessionSetCookie(session);

  await createCommunitySessionRecord(options.env, {
    userId: user.id,
    sessionHash: await sha256Hex(session),
    userAgent: requestUserAgent(options.request),
    ipHint: requestClientIp(options.request),
    expiresAt: new Date(payload.exp * 1000)
  });

  const origin = siteOrigin(options.request, options.env);
  const returnPath = safeCommunityReturnPath(options.returnTo);
  const supportedReturn = returnPath.startsWith("/community/")
    || returnPath.startsWith("/api/community-auth/quality-handoff?");
  const location = supportedReturn
    ? `${origin.replace(/\/$/, "")}${returnPath}`
    : `${origin.replace(/\/$/, "")}/community/${options.slug}`;

  return {
    location,
    cookie,
    membership
  };
}

async function upsertCommunityOAuthIdentity(sql: CommunitySql, userId: string, identity: OAuthIdentity) {
  const separator = identity.identityId.indexOf(":");
  const providerSubject = separator >= 0 ? identity.identityId.slice(separator + 1) : identity.identityId;
  await sql`
    insert into fenrir_community_oauth_identities (user_id, provider, provider_subject, provider_email)
    values (${userId}, ${identity.provider}, ${providerSubject}, ${identity.email})
    on conflict (provider, provider_subject) do update
      set user_id = excluded.user_id,
          provider_email = excluded.provider_email,
          updated_at = now()
  `;
}

function redirect(location: string, extraHeaders: Record<string, string> = {}) {
  return new Response(null, {
    status: 302,
    headers: { Location: location, ...extraHeaders }
  });
}

function redirectWithCommunityOAuthCleanup(origin: string, slug: string, error: string) {
  return redirect(communityOAuthErrorLocation(origin, slug, error), {
    "Set-Cookie": clearCommunityTransactionCookie()
  });
}

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}
