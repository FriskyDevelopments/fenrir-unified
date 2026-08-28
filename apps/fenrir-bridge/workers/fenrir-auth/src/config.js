// Provider catalog + per-request config derived from env.
// Secret names match existing Fenrir Pages vars and the folios-auth-worker
// contract. Do not invent credentials — map the OAuth apps you already have
// onto https://myfenrir.com/auth/{provider}/callback.

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
    extraAuthParams: { response_mode: "query" },
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

/**
 * Reads the first configured non-empty secret value for a setting.
 * @param {Object} env - Environment variables containing the secret.
 * @param {string} name - Secret name or alias group to read.
 * @return {string} The configured secret value, or an empty string when none is available.
 */
export function readSecret(env, name) {
  const aliases = SECRET_ALIASES[name] || [name];
  for (const key of aliases) {
    const value = env[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

/**
 * Looks up OAuth provider metadata by name.
 * @param {string} name - The provider name.
 * @return {Object|null} The provider metadata, or `null` when no matching provider exists.
 */
export function getProvider(name) {
  return PROVIDERS[name] || null;
}

/**
 * Determines whether authentication can begin for a provider.
 * @param {Object} provider - The OAuth provider metadata.
 * @param {Object} env - The environment settings containing provider credentials.
 * @returns {boolean} `true` if the provider's client ID is configured, `false` otherwise.
 */
export function canStartAuth(provider, env) {
  return Boolean(readSecret(env, provider.clientIdEnv));
}

/**
 * Determines whether an OAuth provider has all required credentials configured.
 * @param {Object} provider - The OAuth provider metadata.
 * @param {Object} env - Environment variables containing provider credentials.
 * @returns {boolean} `true` if the provider is fully configured, `false` otherwise.
 */
export function providerConfigured(provider, env) {
  const hasId = canStartAuth(provider, env);
  if (provider.clientSecretEnv) return hasId && Boolean(readSecret(env, provider.clientSecretEnv));
  if (provider.label === "Apple") {
    return hasId && Boolean(env.APPLE_TEAM_ID) && Boolean(env.APPLE_KEY_ID) && Boolean(env.APPLE_PRIVATE_KEY);
  }
  return hasId;
}

/**
 * Builds the OAuth callback URL for a provider.
 * @param {Object} env - Environment containing the configured base URL.
 * @param {string} providerName - Name of the OAuth provider.
 * @returns {string} The provider callback URL.
 */
export function redirectUri(env, providerName) {
  return `${cfg(env).baseUrl}/auth/${providerName}/callback`;
}

/**
 * Builds application configuration from environment settings and defaults.
 * @param {Object} env - Environment settings used to configure the application.
 * @returns {Object} The normalized application configuration.
 */
export function cfg(env) {
  return {
    baseUrl: (env.BASE_URL || "https://myfenrir.com").replace(/\/$/, ""),
    cookieName: env.SESSION_COOKIE_NAME || "fenrir_session",
    cookieDomain: env.COOKIE_DOMAIN || "myfenrir.com",
    postLoginRedirect: env.POST_LOGIN_REDIRECT || "https://myfenrir.com/main",
    logoutRedirect: env.LOGOUT_REDIRECT || "https://myfenrir.com/login",
    sessionTtl: parseInt(env.SESSION_TTL_SECONDS || "604800", 10),
    sessionSecret: readSecret(env, "SESSION_SECRET"),
    databaseUrl: readSecret(env, "DATABASE_URL"),
    allowedRedirectHosts: (env.ALLOWED_REDIRECT_HOSTS || "myfenrir.com,www.myfenrir.com")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    trustedOrigins: (env.TRUSTED_ORIGINS || "https://myfenrir.com,https://www.myfenrir.com")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/**
 * Identifies credentials that are missing from the environment for an OAuth provider.
 * @param {Object} provider - The OAuth provider metadata.
 * @param {Object} env - The environment containing provider credentials.
 * @returns {string[]} The names of missing credential variables.
 */
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
