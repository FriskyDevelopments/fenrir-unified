// Fenrir Better Auth identity Worker.
// Public contract copied from folios-auth-worker (behavior/endpoints, not a Folios merge).
// Session cookies are host-only. Do not serve Fenrir login on folios.works.
// One fetch handler, isolate per request. Hosts: myfenrir.com + www.myfenrir.com.
import {
  getProvider,
  providerConfigured,
  canStartAuth,
  cfg,
  PROVIDERS,
  redirectUri,
  missingSecrets,
} from "./config.js";
import { createFenrirBetterAuth } from "./better-auth.js";
import { buildAuthorizeUrl, exchangeCode, fetchProfile } from "./oauth.js";
import { createPkce, randomToken } from "./crypto.js";
import { createSession, getSession, destroySession } from "./identity.js";
import { checkDatabase } from "./neon.js";
import { saveOAuthState, consumeOAuthState } from "./session.js";
import { decodeJwtPayload } from "./apple.js";

export { OAuthState } from "./session.js";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function redirect(location, extraHeaders = {}) {
  return new Response(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": "no-store", ...extraHeaders },
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  try {
    const host = new URL(origin).hostname;
    if (!cfg(env).allowedRedirectHosts.includes(host)) return {};
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      Vary: "Origin",
      "Access-Control-Allow-Headers": "Accept, Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    };
  } catch {
    return {};
  }
}

function withCors(response, request, env) {
  const extra = corsHeaders(request, env);
  if (!Object.keys(extra).length) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

function wantsHtml(request) {
  const accept = request.headers.get("Accept") || "";
  return accept.includes("text/html");
}

function authFailure(request, env, error, status = 400, extra = {}) {
  if (wantsHtml(request)) {
    const dest = new URL("/login", cfg(env).baseUrl);
    dest.searchParams.set("error", error);
    return redirect(dest.toString());
  }
  return json({ error, ...extra }, status);
}

function hostnameOf(request) {
  try {
    return new URL(request.url).hostname;
  } catch {
    return "";
  }
}

function isFenrirHost(request) {
  const host = hostnameOf(request);
  if (!host) return false;
  if (host === "folios.works" || host.endsWith(".folios.works")) return false;
  return (
    host === "myfenrir.com" ||
    host.endsWith(".myfenrir.com") ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".workers.dev")
  );
}

export function safeReturnTo(env, raw) {
  const c = cfg(env);
  const fallback = c.postLoginRedirect;
  if (!raw) return fallback;
  try {
    if (raw.startsWith("/") && !raw.startsWith("//")) return `${c.baseUrl}${raw}`;
    const u = new URL(raw);
    if (u.protocol === "https:" && c.allowedRedirectHosts.includes(u.hostname)) return u.toString();
    return fallback;
  } catch {
    return fallback;
  }
}

async function handleStart(request, env, providerName) {
  const provider = getProvider(providerName);
  if (!provider) return json({ error: "unknown_provider", provider: providerName }, 404);
  const c = cfg(env);
  const canonical = canonicalAuthRedirect(request, c.baseUrl);
  if (canonical) return canonical;
  if (!c.sessionSecret) return json({ error: "server_not_configured", missing: ["SESSION_SECRET"] }, 503);

  const url = new URL(request.url);
  const returnTo = safeReturnTo(env, url.searchParams.get("redirect"));

  const state = randomToken(24);
  const nonce = randomToken(16);
  let pkce = { verifier: null, challenge: null };
  if (provider.usesPkce) pkce = await createPkce();

  const authorizeUrl = buildAuthorizeUrl(provider, providerName, env, {
    state,
    codeChallenge: pkce.challenge,
    nonce,
  });

  if (!canStartAuth(provider, env)) {
    return json(
      {
        error: "provider_client_id_missing",
        provider: providerName,
        missing: missingSecrets(provider, env),
        note: `Set ${provider.clientIdEnv} and this endpoint 302-redirects to the URL below. The client secret is only needed at the callback/token-exchange step.`,
        would_redirect_to: authorizeUrl,
        redirect_uri_registered_must_be: redirectUri(env, providerName),
      },
      503
    );
  }

  await saveOAuthState(env, state, {
    provider: providerName,
    codeVerifier: pkce.verifier,
    nonce,
    returnTo,
  });
  return redirect(authorizeUrl);
}

async function handleCallback(request, env, providerName) {
  const provider = getProvider(providerName);
  if (!provider) return json({ error: "unknown_provider", provider: providerName }, 404);
  const canonical = canonicalAuthRedirect(request, cfg(env).baseUrl);
  if (canonical) return canonical;

  let params;
  let applePostedUser = null;
  if (request.method === "POST") {
    const form = await request.formData();
    params = form;
    applePostedUser = form.get("user");
  } else {
    params = new URL(request.url).searchParams;
  }

  const err = params.get("error");
  if (err) return authFailure(request, env, "provider_error", 400, { detail: err, description: params.get("error_description") });

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return authFailure(request, env, "missing_code_or_state");

  const saved = await consumeOAuthState(env, state);
  if (!saved) return authFailure(request, env, "invalid_or_expired_state");
  if (saved.provider !== providerName) return authFailure(request, env, "state_provider_mismatch");

  let tokens;
  try {
    tokens = await exchangeCode(provider, providerName, env, { code, codeVerifier: saved.codeVerifier });
  } catch (e) {
    return authFailure(request, env, "token_exchange_failed", 502, { detail: String(e.message || e) });
  }

  if (providerName === "apple") {
    const claims = decodeJwtPayload(tokens.id_token);
    if (!claims?.nonce || claims.nonce !== saved.nonce) {
      return authFailure(request, env, "invalid_or_expired_state");
    }
  }

  let profile;
  try {
    profile = await fetchProfile(provider, providerName, env, tokens, applePostedUser);
  } catch (e) {
    return authFailure(request, env, "profile_fetch_failed", 502, { detail: String(e.message || e) });
  }

  if (!profile.sub) return authFailure(request, env, "no_subject_in_profile", 502);

  const user = {
    id: `${providerName}:${profile.sub}`,
    provider: providerName,
    sub: profile.sub,
    email: profile.email,
    email_verified: profile.email_verified,
    name: profile.name,
    picture: profile.picture,
  };

  let cookie;
  try {
    ({ cookie } = await createSession(env, user, {
      userAgent: request.headers.get("User-Agent"),
      ip: request.headers.get("CF-Connecting-IP"),
    }));
  } catch (e) {
    return authFailure(request, env, "session_create_failed", 503, { detail: String(e.message || e) });
  }
  return redirect(saved.returnTo || cfg(env).postLoginRedirect, { "Set-Cookie": cookie });
}

async function handleMe(request, env) {
  try {
    const session = await getSession(env, request);
    if (!session) return json({ authenticated: false }, 200);
    return json({ authenticated: true, user: session.user, expiresAt: session.expiresAt }, 200);
  } catch (error) {
    console.error(JSON.stringify({
      message: "auth_me_failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    return json({ authenticated: false }, 200);
  }
}

async function handleLogout(request, env) {
  const cookie = await destroySession(env, request);
  const url = new URL(request.url);
  const redirectParam = url.searchParams.get("redirect");
  const dest = redirectParam ? safeReturnTo(env, redirectParam) : cfg(env).logoutRedirect;
  return redirect(dest, { "Set-Cookie": cookie });
}

function handleProviders(env) {
  const identity = createFenrirBetterAuth(env);
  const out = {};
  for (const name of Object.keys(PROVIDERS)) {
    const p = PROVIDERS[name];
    const social = identity.socialProviders[name];
    out[name] = {
      label: p.label,
      configured: social.configured,
      can_start: social.canStart,
      start: `${cfg(env).baseUrl}/auth/${name}`,
      callback: redirectUri(env, name),
      missing: social.configured ? [] : missingSecrets(p, env),
    };
  }
  return json({ providers: out, identity: identity.identity });
}

async function handleReady(env) {
  const identity = createFenrirBetterAuth(env);
  const providers = Object.fromEntries(
    Object.entries(PROVIDERS).map(([name, provider]) => [name, providerConfigured(provider, env)])
  );
  const database = await checkDatabase(env);
  const sessionSecret = Boolean(identity.secret);
  const kv = Boolean(env.SESSIONS);
  const oauthState = Boolean(env.OAUTH_STATE);
  const loginReady = sessionSecret && oauthState && Object.values(providers).every(Boolean) && (database.ok || kv);
  return json({
    ready: loginReady,
    database: database.ok,
    session_backend: database.ok ? "neon" : "kv",
    oauth_state_backend: oauthState ? "durable_object" : "unavailable",
    degraded: !database.ok,
    session_secret: sessionSecret,
    providers,
  }, loginReady ? 200 : 503);
}

export default {
  async fetch(request, env) {
    if (!isFenrirHost(request)) {
      return json({ error: "not_found", hint: "Fenrir Better Auth only serves myfenrir.com" }, 404);
    }

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } }), request, env);
    }

    try {
      return withCors(await handleRequest(request, env), request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(JSON.stringify({
        message: "unhandled error",
        error: message,
        path: new URL(request.url).pathname,
      }));
      return withCors(json({ error: "internal_server_error" }, 500), request, env);
    }
  },
};

function canonicalAuthRedirect(request, baseUrl) {
  const requestUrl = new URL(request.url);
  const canonicalUrl = new URL(baseUrl);
  if (requestUrl.origin === canonicalUrl.origin) return null;
  requestUrl.protocol = canonicalUrl.protocol;
  requestUrl.host = canonicalUrl.host;
  return new Response(null, {
    status: 307,
    headers: { Location: requestUrl.toString(), "Cache-Control": "no-store" },
  });
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);

  if (parts[0] !== "auth") {
    return json({ error: "not_found", hint: "This Worker only serves /auth/*" }, 404);
  }

  if (parts[1] === "api") {
    return json({ error: "not_found", hint: "Fenrir identity has no /auth/api data plane" }, 404);
  }

  if (parts.length === 2) {
    switch (parts[1]) {
      case "health":
        return json({ ok: true, service: "fenrir-auth-worker" });
      case "ready":
        return handleReady(env);
      case "me":
        return handleMe(request, env);
      case "logout":
        return handleLogout(request, env);
      case "providers":
        return handleProviders(env);
      default:
        if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
        return handleStart(request, env, parts[1]);
    }
  }

  if (parts.length === 3 && parts[2] === "callback") {
    if (request.method !== "GET" && request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }
    return handleCallback(request, env, parts[1]);
  }

  return json({ error: "not_found", path }, 404);
}
