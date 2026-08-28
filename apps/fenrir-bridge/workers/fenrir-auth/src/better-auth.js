// Fenrir Better Auth identity — created per request (Workers isolate model).
//
// This is the Fenrir identity engine that replaced Authentic / the Supabase
// proxy. Public HTTP stays on the folios-auth-worker contract (`/auth/google`,
// `/auth/{provider}/callback`, HMAC cookie). Better Auth's default `/api/auth/*`
// router is out of scope for this MVP.
//
// Bindings (KV, secrets) are read from `env` — never the Cloudflare REST API.

import { cfg, PROVIDERS, canStartAuth, providerConfigured, redirectUri, readSecret } from "./config.js";

/**
 * Creates the Better Auth configuration for the request environment.
 * @param {object} env - Environment bindings and secrets used to configure authentication.
 * @returns {object} The Better Auth identity, provider, origin, and session configuration.
 */
export function createFenrirBetterAuth(env) {
  const c = cfg(env);
  const socialProviders = {};
  for (const name of Object.keys(PROVIDERS)) {
    const provider = PROVIDERS[name];
    socialProviders[name] = {
      label: provider.label,
      clientId: readSecret(env, provider.clientIdEnv),
      configured: providerConfigured(provider, env),
      canStart: canStartAuth(provider, env),
      pkce: provider.usesPkce ? "S256" : null,
      startPath: `/auth/${name}`,
      callbackURL: redirectUri(env, name),
    };
  }

  return {
    identity: "better-auth",
    secret: c.sessionSecret,
    baseURL: c.baseUrl,
    trustedOrigins: c.trustedOrigins,
    socialProviders,
    session: {
      cookieName: c.cookieName,
      cookieDomain: c.cookieDomain,
      expiresIn: c.sessionTtl,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  };
}
