// Fenrir Better Auth identity Worker.
// Public contract copied from folios-auth-worker (behavior/endpoints, not a Folios merge).
// Cookie domain is myfenrir.com on Fenrir hosts and friskydev.com on Forge/Paperclip/MCP.
// Do not serve Fenrir login on folios.works.
// One fetch handler, isolate per request.
import {
  getProvider,
  providerConfigured,
  canStartAuth,
  cfg,
  PROVIDERS,
  redirectUri,
  missingSecrets,
  hostnameOf,
  isAllowedAuthHost,
  isFriskyDevHost,
  bindRequest,
} from "./config.js";
import { createFenrirBetterAuth } from "./better-auth.js";
import { buildAuthorizeUrl, exchangeCode, fetchProfile } from "./oauth.js";
import { createPkce, randomToken } from "./crypto.js";
import { createSession, getSession, destroySession } from "./identity.js";
import { checkDatabase } from "./neon.js";
import { saveOAuthState, consumeOAuthState } from "./session.js";

export { SessionAuthority } from "./session.js";

const LOGIN_ERRORS = {
  provider_error: "The identity provider rejected the sign-in.",
  missing_code_or_state: "The sign-in response was incomplete. Try again.",
  invalid_or_expired_state: "That sign-in expired. Start again.",
  state_provider_mismatch: "That sign-in could not be matched. Start again.",
  token_exchange_failed: "Could not finish the sign-in with that provider.",
  profile_fetch_failed: "Could not read the account profile. Try again.",
  no_subject_in_profile: "The provider did not return an account id.",
  session_create_failed: "Signed in at the provider, but the session could not be stored.",
};

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

function html(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
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

function isFenrirHost(request) {
  return isAllowedAuthHost(hostnameOf(request));
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "\u0026amp;";
    if (ch === "<") return "\u0026lt;";
    if (ch === ">") return "\u0026gt;";
    if (ch === '"') return "\u0026quot;";
    if (ch === "'") return "\u0026#39;";
    return ch;
  });
}

function loginErrorMessage(code) {
  return LOGIN_ERRORS[String(code || "")] || "";
}

function loginPage(env, { error = "", user = null } = {}) {
  const message = loginErrorMessage(error);
  const err = message ? `<div class="err">${escapeHtml(message)}</div>` : "";
  const signedIn = user
    ? `<p class="sub">Signed in as ${escapeHtml(user.email || user.name || user.id)}. This session is a Better Auth cookie on this host.</p>
  <div class="stack">
          <a class="btn btn-google" href="/auth/logout?redirect=%2Flogin">Sign out</a>
  </div>`
    : `<p class="sub">Better Auth for Paperclip and Forge. Pick Google, Microsoft, or Apple. This is not Cloudflare Access.</p>
  ${err}
  <div class="stack">
          <a class="btn btn-google" href="/auth/google?redirect=%2F">Continue with Google</a>
          <a class="btn btn-microsoft" href="/auth/microsoft?redirect=%2F">Continue with Microsoft</a>
          <a class="btn btn-apple" href="/auth/apple?redirect=%2F">Continue with Apple</a>
  </div>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Sign in — Frisky</title>
<meta name="robots" content="noindex"/>
<style>
:root{--bg:#09090b;--card:#18181b;--text:#fafafa;--muted:#a1a1aa;--line:#27272a;--accent:#f97316}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}
body{min-height:100svh;display:grid;place-items:center;padding:32px 16px;background:
  radial-gradient(900px 480px at 90% -10%, rgba(249,115,22,.18), transparent 55%),
  radial-gradient(700px 420px at 0% 110%, rgba(14,165,233,.14), transparent 50%), var(--bg)}
.card{width:min(420px,100%);background:rgba(24,24,27,.92);border:1px solid var(--line);border-radius:20px;padding:28px 24px 24px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
.brand{font-weight:800;letter-spacing:-.04em;font-size:22px}
.brand span{color:var(--accent)}
h1{font-size:1.45rem;margin:18px 0 6px;letter-spacing:-.03em}
.sub{color:var(--muted);font-size:14px;line-height:1.5;margin:0 0 22px}
.stack{display:grid;gap:10px}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:12px 16px;border-radius:12px;border:1px solid var(--line);background:#fff;color:#111;font-weight:650;text-decoration:none;font-size:14.5px}
.btn-google{background:#fff}
.btn-microsoft{background:#fff}
.btn-apple{background:#111;color:#fff;border-color:#111}
.err{background:#3f1d20;color:#fecaca;border:1px solid #7f1d1d;border-radius:12px;padding:10px 12px;font-size:13px;margin-bottom:14px}
.foot{margin-top:18px;color:#71717a;font-size:11px;text-align:center;letter-spacing:.08em;text-transform:uppercase}
</style>
</head>
<body>
<main class="card">
  <div class="brand">Frisky<span>Dev</span></div>
  <h1>${user ? "Signed in — Frisky" : "Sign in — Frisky"}</h1>
  ${signedIn}
  <div class="foot">Frisky Better Auth</div>
</main>
</body>
</html>`;
}

export function safeReturnTo(env, raw) {
  const c = cfg(env);
  const fallback = c.postLoginRedirect;
  if (!raw) return fallback;
  try {
    if (raw.startsWith("/") && !raw.startsWith("//")) return `${c.baseUrl}${raw}`;
    const u = new URL(raw);
    if ((u.protocol === "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1") && c.allowedRedirectHosts.includes(u.hostname)) {
      return u.toString();
    }
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
  const kv = Boolean(env.SESSIONS && env.SESSION_AUTHORITY);
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

async function handleAppShell(request, env) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error") || "";
  const session = await getSession(env, request);
  return html(loginPage(env, { error, user: session?.user || null }));
}

export default {
  async fetch(request, env) {
    env = bindRequest(env, request);

    if (!isFenrirHost(request)) {
      return json({ error: "not_found", hint: "Fenrir Better Auth only serves myfenrir.com and friskydev.com apps" }, 404);
    }

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

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  const host = hostnameOf(request);

  if (parts.length === 0 || parts[0] === "login") {
    if (isFriskyDevHost(host) || host === "localhost" || host === "127.0.0.1" || host.endsWith(".workers.dev")) {
      if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "method_not_allowed" }, 405);
      return handleAppShell(request, env);
    }
    if (parts[0] === "login") {
      if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "method_not_allowed" }, 405);
      return handleAppShell(request, env);
    }
    return json({ error: "not_found", hint: "This Worker only serves /auth/*" }, 404);
  }

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
