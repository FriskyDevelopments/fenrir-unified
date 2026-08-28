// Fenrir Better Auth identity Worker.
// Public contract copied from folios-auth-worker (behavior/endpoints, not a Folios merge).
// Cookie domain is myfenrir.com. Do not serve Fenrir login on folios.works.
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
import { createSession, getSession, destroySession, checkDatabase } from "./neon.js";
import { saveOAuthState, consumeOAuthState } from "./session.js";

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
  if (err) return json({ error: "provider_error", detail: err, description: params.get("error_description") }, 400);

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return json({ error: "missing_code_or_state" }, 400);

  const saved = await consumeOAuthState(env, state);
  if (!saved) return json({ error: "invalid_or_expired_state" }, 400);
  if (saved.provider !== providerName) return json({ error: "state_provider_mismatch" }, 400);

  let tokens;
  try {
    tokens = await exchangeCode(provider, providerName, env, { code, codeVerifier: saved.codeVerifier });
  } catch (e) {
    return json({ error: "token_exchange_failed", detail: String(e.message || e) }, 502);
  }

  let profile;
  try {
    profile = await fetchProfile(provider, providerName, env, tokens, applePostedUser);
  } catch (e) {
    return json({ error: "profile_fetch_failed", detail: String(e.message || e) }, 502);
  }

  if (!profile.sub) return json({ error: "no_subject_in_profile" }, 502);

  const user = {
    id: `${providerName}:${profile.sub}`,
    provider: providerName,
    sub: profile.sub,
    email: profile.email,
    email_verified: profile.email_verified,
    name: profile.name,
    picture: profile.picture,
  };

  const { cookie } = await createSession(env, user, {
    userAgent: request.headers.get("User-Agent"),
    ip: request.headers.get("CF-Connecting-IP"),
  });
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
  const to = safeReturnTo(env, url.searchParams.get("redirect")) || cfg(env).logoutRedirect;
  const dest = url.searchParams.get("redirect") ? to : cfg(env).logoutRedirect;
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
  const ready = database.ok && sessionSecret && Object.values(providers).every(Boolean);
  return json({ ready, database: database.ok, session_secret: sessionSecret, providers }, ready ? 200 : 503);
}

export default {
  async fetch(request, env) {
    try {
      if (!isFenrirHost(request)) {
        return json({ error: "not_found", hint: "Fenrir Better Auth only serves myfenrir.com" }, 404);
      }

      // Per-request identity isolate — do not store auth on the module.
      createFenrirBetterAuth(env);

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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(JSON.stringify({
        message: "unhandled error",
        error: message,
        path: new URL(request.url).pathname,
      }));
      return json({ error: "internal_server_error" }, 500);
    }
  },
};
