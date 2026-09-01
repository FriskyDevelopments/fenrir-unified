// Provider catalog + per-request config derived from env.
// Secret names match existing Fenrir Pages vars and the folios-auth-worker
// contract. Do not invent credentials — map the OAuth apps you already have
// onto https://{host}/auth/{provider}/callback.

export const PROVIDERS = {
  google: {
    label: "Google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    usesPkce: true,
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    profileSource: "userinfo",
    extraAuthParams: { access_type: "online", prompt: "select_account" },
  },
  microsoft: {
    label: "Microsoft",
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userInfoUrl: "https://graph.microsoft.com/oidc/userinfo",
    scope: "openid email profile",
    usesPkce: true,
    clientIdEnv: "MS_CLIENT_ID",
    clientSecretEnv: "MS_CLIENT_SECRET",
    profileSource: "userinfo",
    extraAuthParams: { response_mode: "query", prompt: "select_account" },
  },
  apple: {
    label: "Apple",
    authorizeUrl: "https://appleid.apple.com/auth/authorize",
    tokenUrl: "https://appleid.apple.com/auth/token",
    userInfoUrl: null,
    scope: "name email",
    usesPkce: false,
    clientIdEnv: "APPLE_CLIENT_ID",
    clientSecretEnv: null,
    profileSource: "id_token",
    extraAuthParams: { response_mode: "form_post" },
  },
};

const SECRET_ALIASES = {
  SESSION_SECRET: ["SESSION_SECRET", "BETTER_AUTH_SECRET"],
  DATABASE_URL: ["DATABASE_URL", "NEON_DATABASE_URL"],
  MS_CLIENT_ID: ["MS_CLIENT_ID", "MICROSOFT_CLIENT_ID"],
  MS_CLIENT_SECRET: ["MS_CLIENT_SECRET", "MICROSOFT_CLIENT_SECRET"],
};

export const FRISKYDEV_APP_HOSTS = [
  "forge.friskydev.com",
  "paperclip.friskydev.com",
  "mcp.friskydev.com",
];

export function readSecret(env, name) {
  const aliases = SECRET_ALIASES[name] || [name];
  for (const key of aliases) {
    const value = env[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

export function hostnameOf(request) {
  try {
    return new URL(request.url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isMyFenrirHost(host) {
  const h = String(host || "").toLowerCase();
  return h === "myfenrir.com" || h.endsWith(".myfenrir.com");
}

export function isFriskyDevHost(host) {
  const h = String(host || "").toLowerCase();
  return h === "friskydev.com" || h.endsWith(".friskydev.com");
}

export function isAllowedAuthHost(host) {
  const h = String(host || "").toLowerCase();
  if (!h) return false;
  if (h === "folios.works" || h.endsWith(".folios.works")) return false;
  return (
    isMyFenrirHost(h) ||
    isFriskyDevHost(h) ||
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.endsWith(".workers.dev")
  );
}

export function cookieDomainForHost(host, fallback = "myfenrir.com") {
  const h = String(host || "").toLowerCase();
  if (isMyFenrirHost(h)) return "myfenrir.com";
  if (isFriskyDevHost(h)) return "friskydev.com";
  if (h === "localhost" || h === "127.0.0.1" || h.endsWith(".workers.dev")) return "";
  return fallback;
}

export function requestOrigin(request) {
  try {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") {
      return `${url.protocol}//${url.host}`;
    }
    return `https://${host}`;
  } catch {
    return "";
  }
}

export function bindRequest(env, request) {
  const host = hostnameOf(request);
  return {
    ...env,
    AUTH_REQUEST_HOST: host,
    AUTH_REQUEST_ORIGIN: requestOrigin(request),
  };
}

export function getProvider(name) {
  return PROVIDERS[name] || null;
}

export function canStartAuth(provider, env) {
  return Boolean(readSecret(env, provider.clientIdEnv));
}

export function providerConfigured(provider, env) {
  const hasId = canStartAuth(provider, env);
  if (provider.clientSecretEnv) return hasId && Boolean(readSecret(env, provider.clientSecretEnv));
  if (provider.label === "Apple") {
    return hasId && Boolean(env.APPLE_TEAM_ID) && Boolean(env.APPLE_KEY_ID) && Boolean(env.APPLE_PRIVATE_KEY);
  }
  return hasId;
}

export function redirectUri(env, providerName) {
  return `${cfg(env).baseUrl}/auth/${providerName}/callback`;
}

export function cfg(env) {
  const requestHost = String(env?.AUTH_REQUEST_HOST || "").toLowerCase();
  const requestOriginValue = String(env?.AUTH_REQUEST_ORIGIN || "").replace(/\/$/, "");
  const defaultBase = (env.BASE_URL || "https://myfenrir.com").replace(/\/$/, "");
  const hostOk = requestHost && isAllowedAuthHost(requestHost);
  const baseUrl = hostOk
    ? (requestOriginValue || `https://${requestHost}`)
    : defaultBase;
  const cookieDomain = requestHost
    ? cookieDomainForHost(requestHost, env.COOKIE_DOMAIN || "myfenrir.com")
    : (env.COOKIE_DOMAIN || "myfenrir.com");

  const extraHosts = [];
  if (requestHost) extraHosts.push(requestHost);
  extraHosts.push(...FRISKYDEV_APP_HOSTS);

  const allowedRedirectHosts = Array.from(new Set([
    ...(env.ALLOWED_REDIRECT_HOSTS || "myfenrir.com,www.myfenrir.com")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    ...extraHosts,
  ]));

  const trustedOrigins = Array.from(new Set([
    ...(env.TRUSTED_ORIGINS || "https://myfenrir.com,https://www.myfenrir.com")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    ...allowedRedirectHosts.map((h) => `https://${h}`),
  ]));

  const friskyApp = requestHost && isFriskyDevHost(requestHost);
  return {
    baseUrl,
    cookieName: env.SESSION_COOKIE_NAME || "fenrir_session",
    cookieDomain,
    postLoginRedirect: friskyApp ? `${baseUrl}/` : (env.POST_LOGIN_REDIRECT || "https://myfenrir.com/main"),
    logoutRedirect: friskyApp ? `${baseUrl}/login` : (env.LOGOUT_REDIRECT || "https://myfenrir.com/login"),
    sessionTtl: parseInt(env.SESSION_TTL_SECONDS || "604800", 10),
    sessionSecret: readSecret(env, "SESSION_SECRET"),
    databaseUrl: readSecret(env, "DATABASE_URL"),
    allowedRedirectHosts,
    trustedOrigins,
  };
}

export function missingSecrets(provider, env) {
  const missing = [];
  if (!readSecret(env, provider.clientIdEnv)) missing.push(provider.clientIdEnv);
  if (provider.clientSecretEnv && !readSecret(env, provider.clientSecretEnv)) {
    missing.push(provider.clientSecretEnv);
  }
  if (provider.label === "Apple") {
    for (const k of ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"]) {
      if (!env[k]) missing.push(k);
    }
  }
  return missing;
}
