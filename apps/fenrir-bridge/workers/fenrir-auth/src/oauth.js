// Provider-agnostic OAuth 2.0 authorization-code helpers.
import { redirectUri, readSecret } from "./config.js";
import { createAppleClientSecret, decodeJwtPayload } from "./apple.js";

export function buildAuthorizeUrl(provider, providerName, env, { state, codeChallenge, nonce }) {
  const clientId = readSecret(env, provider.clientIdEnv);
  const params = new URLSearchParams(provider.extraAuthParams || {});
  params.set("response_type", "code");
  params.set("client_id", clientId || "");
  params.set("redirect_uri", redirectUri(env, providerName));
  params.set("scope", provider.scope);
  params.set("state", state);
  if (nonce) params.set("nonce", nonce);
  else params.delete("nonce");
  if (provider.usesPkce && codeChallenge) {
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  } else {
    params.delete("code_challenge");
    params.delete("code_challenge_method");
  }
  return `${provider.authorizeUrl}?${params.toString()}`;
}

export async function exchangeCode(provider, providerName, env, { code, codeVerifier }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(env, providerName),
    client_id: readSecret(env, provider.clientIdEnv) || "",
  });

  if (provider.usesPkce && codeVerifier) body.set("code_verifier", codeVerifier);

  if (providerName === "apple") {
    body.set("client_secret", await createAppleClientSecret(env));
  } else if (provider.clientSecretEnv) {
    body.set("client_secret", readSecret(env, provider.clientSecretEnv) || "");
  }

  const resp = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });

  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!resp.ok || !json) {
    throw new Error(`token_exchange_failed status=${resp.status} body=${text.slice(0, 300)}`);
  }
  return json;
}

export async function fetchProfile(provider, providerName, env, tokens, applePostedUser) {
  if (provider.profileSource === "userinfo") {
    const resp = await fetch(provider.userInfoUrl, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`userinfo_failed status=${resp.status} body=${t.slice(0, 200)}`);
    }
    const u = await resp.json();
    return {
      provider: providerName,
      sub: u.sub,
      email: u.email || null,
      email_verified: u.email_verified ?? null,
      name: u.name || u.given_name || null,
      picture: u.picture || null,
    };
  }

  if (provider.profileSource === "id_token") {
    const claims = decodeJwtPayload(tokens.id_token) || {};
    let name = null;
    if (applePostedUser) {
      try {
        const parsed =
          typeof applePostedUser === "string" ? JSON.parse(applePostedUser) : applePostedUser;
        if (parsed?.name) {
          name = [parsed.name.firstName, parsed.name.lastName].filter(Boolean).join(" ") || null;
        }
      } catch {
        /* ignore malformed user payload */
      }
    }
    return {
      provider: providerName,
      sub: claims.sub,
      email: claims.email || null,
      email_verified: claims.email_verified ?? null,
      name,
      picture: null,
    };
  }

  throw new Error(`unknown_profile_source:${provider.profileSource}`);
}
