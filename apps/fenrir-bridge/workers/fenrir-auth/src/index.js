// Fenrir Better Auth identity Worker.
// Public contract copied from folios-auth-worker (behavior/endpoints, not a Folios merge).
// Cookie domain is myfenrir.com. Do not serve Fenrir login on folios.works.
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

/**
 * Creates a JSON response with no-store caching.
 * @param {*} data - The value to serialize as JSON.
 * @param {number} [status=200] - The HTTP response status.
 * @param {Object} [extraHeaders={}] - Additional response headers.
 * @return {Response} The JSON response.
 */
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

/**
 * Create a no-store redirect response.
 * @param {string} location - The destination URL.
 * @param {Object} [extraHeaders={}] - Additional response headers.
 * @return {Response} The redirect response.
 */
function redirect(location, extraHeaders = {}) {
  return new Response(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": "no-store", ...extraHeaders },
  });
}

/**
 * Determines the CORS headers for an approved request origin.
 * @param {Request} request - The request whose origin is evaluated.
 * @param {Object} env - The worker environment containing allowed redirect hosts.
 * @returns {Object} CORS headers for an approved origin, or an empty object otherwise.
 */
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

/**
 * Adds configured CORS headers to a response when the request is eligible.
 * @param {Response} response - The response to update.
 * @param {Request} request - The request used to determine CORS eligibility.
 * @param {Object} env - The Worker environment containing CORS configuration.
 * @return {Response} The response with applicable CORS headers.
 */
function withCors(response, request, env) {
  const extra = corsHeaders(request, env);
  if (!Object.keys(extra).length) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Determines whether the request accepts HTML responses.
 * @param {Request} request - The incoming request.
 * @returns {boolean} `true` if the request accepts HTML, `false` otherwise.
 */
function wantsHtml(request) {
  const accept = request.headers.get("Accept") || "";
  return accept.includes("text/html");
}

/**
 * Creates an authentication failure response in HTML-friendly or JSON format.
 * @param {Request} request - The incoming request.
 * @param {object} env - The Worker environment containing authentication configuration.
 * @param {string} error - The authentication error code.
 * @param {number} [status=400] - The HTTP status code for JSON responses.
 * @param {object} [extra={}] - Additional properties to include in the JSON response.
 * @return {Response} A redirect to the login page or a JSON error response.
 */
function authFailure(request, env, error, status = 400, extra = {}) {
  if (wantsHtml(request)) {
    const dest = new URL("/login", cfg(env).baseUrl);
    dest.searchParams.set("error", error);
    return redirect(dest.toString());
  }
  return json({ error, ...extra }, status);
}

/**
 * Extract the hostname from a request URL.
 * @param {Request} request - The request whose URL to inspect.
 * @return {string} The URL hostname, or an empty string when the URL is invalid.
 */
function hostnameOf(request) {
  try {
    return new URL(request.url).hostname;
  } catch {
    return "";
  }
}

/**
 * Determines whether a request targets an approved Fenrir host.
 * @param {Request} request - The request whose hostname is checked.
 * @return {boolean} `true` if the hostname is approved, `false` otherwise.
 */
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

/**
 * Resolves a post-authentication redirect destination.
 * @param {Object} env - Worker environment containing redirect configuration.
 * @param {string} raw - Candidate redirect destination.
 * @return {string} An approved redirect URL, or the configured post-login fallback.
 */
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

/**
 * Initiate an OAuth authorization flow for a provider.
 * @param {string} providerName - The identifier of the OAuth provider to use.
 * @return {Promise<Response>} A redirect response to the provider, or a JSON error response when the provider or server configuration is unavailable.
 */
async function handleStart(request, env, providerName) {
  const provider = getProvider(providerName);
  if (!provider) return json({ error: "unknown_provider", provider: providerName }, 404);
  const c = cfg(env);
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

/**
 * Completes an OAuth callback and establishes a session for the authenticated user.
 * @param {Request} request - The OAuth callback request.
 * @param {Object} env - The Worker environment configuration.
 * @param {string} providerName - The OAuth provider associated with the callback.
 * @return {Promise<Response>} A redirect response on success or an authentication error response.
 */
async function handleCallback(request, env, providerName) {
  const provider = getProvider(providerName);
  if (!provider) return json({ error: "unknown_provider", provider: providerName }, 404);

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

/**
 * Destroys the current session and redirects to the requested or configured logout destination.
 * @param {Request} request - The logout request, including an optional redirect destination.
 * @param {Object} env - The Worker environment containing authentication configuration.
 * @returns {Promise<Response>} A redirect response that clears the session cookie.
 */
async function handleLogout(request, env) {
  const cookie = await destroySession(env, request);
  const url = new URL(request.url);
  const to = safeReturnTo(env, url.searchParams.get("redirect")) || cfg(env).logoutRedirect;
  const dest = url.searchParams.get("redirect") ? to : cfg(env).logoutRedirect;
  return redirect(dest, { "Set-Cookie": cookie });
}

/**
 * Builds the provider configuration response for the authentication API.
 * @param {Object} env - Worker environment configuration.
 * @returns {Response} A JSON response containing provider metadata and identity information.
 */
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

/**
 * Reports whether authentication services are ready to accept login requests.
 * @returns {Response} A JSON response containing readiness, database, session backend, secret, and provider configuration status.
 */
async function handleReady(env) {
  const identity = createFenrirBetterAuth(env);
  const providers = Object.fromEntries(
    Object.entries(PROVIDERS).map(([name, provider]) => [name, providerConfigured(provider, env)])
  );
  const database = await checkDatabase(env);
  const sessionSecret = Boolean(identity.secret);
  const kv = Boolean(env.SESSIONS);
  const loginReady = sessionSecret && Object.values(providers).every(Boolean) && (database.ok || kv);
  return json({
    ready: loginReady,
    database: database.ok,
    session_backend: database.ok ? "neon" : "kv",
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

    // Per-request identity isolate — do not store auth on the module.
    createFenrirBetterAuth(env);

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

/**
 * Dispatches requests to Fenrir authentication endpoints.
 * @param {Request} request - The incoming HTTP request.
 * @param {Object} env - Worker environment bindings and configuration.
 * @returns {Response} The endpoint response, including a not-found response for unsupported paths.
 */
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
