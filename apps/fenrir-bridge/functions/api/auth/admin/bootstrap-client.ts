import {
  constantTimeEqual,
  createFriskyBetterAuth,
  truthy,
  type FriskyBetterAuthEnv,
} from "../../../_lib/better-auth";
import { noStoreJson } from "../../../_lib/responses";

type BootstrapBody = {
  name?: string;
  redirectUris?: string[];
  postLogoutRedirectUris?: string[];
  skipConsent?: boolean;
  requirePkce?: boolean;
};

function randomUrlToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hashClientSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function validHttpsUrls(values: unknown): values is string[] {
  return (
    Array.isArray(values) &&
    values.length > 0 &&
    values.length <= 8 &&
    values.every((value) => {
      if (typeof value !== "string") return false;
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
      } catch {
        return false;
      }
    })
  );
}

export const onRequestPost: PagesFunction<FriskyBetterAuthEnv> = async (context) => {
  const expected = context.env.BETTER_AUTH_MIGRATION_TOKEN?.trim() ?? "";
  const supplied = context.request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (
    !truthy(context.env.BETTER_AUTH_MIGRATION_ENABLED) ||
    !expected ||
    !supplied ||
    !constantTimeEqual(expected, supplied)
  ) {
    return noStoreJson({ ok: false, error: "not_found" }, { status: 404 });
  }

  const body = (await context.request.json().catch(() => ({}))) as BootstrapBody;
  if (!body.name?.trim() || !validHttpsUrls(body.redirectUris)) {
    return noStoreJson({ ok: false, error: "invalid_client_bootstrap" }, { status: 400 });
  }
  if (body.postLogoutRedirectUris && !validHttpsUrls(body.postLogoutRedirectUris)) {
    return noStoreJson({ ok: false, error: "invalid_logout_redirects" }, { status: 400 });
  }

  const { pool } = createFriskyBetterAuth(context.env);
  try {
    const clientId = `frisky_${body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40)}_v1`;
    const clientSecret = randomUrlToken();
    const storedSecret = await hashClientSecret(clientSecret);
    const id = crypto.randomUUID();
    const now = new Date();

    await pool.query(
      `insert into "app_auth_oauth_client" (
        "id", "clientId", "clientSecret", "disabled", "skipConsent",
        "enableEndSession", "scopes", "clientCredentialsScopes", "createdAt",
        "updatedAt", "name", "redirectUris", "postLogoutRedirectUris",
        "tokenEndpointAuthMethod", "applicationType", "grantTypes",
        "responseTypes", "requirePKCE", "dpopBoundAccessTokens", "subjectType"
      ) values (
        $1, $2, $3, false, $4, true, $5, $6, $7, $7, $8, $9, $10,
        'client_secret_basic', 'web', $11, $12, $13, false, 'public'
      )
      on conflict ("clientId") do update set
        "clientSecret" = excluded."clientSecret",
        "disabled" = false,
        "skipConsent" = excluded."skipConsent",
        "enableEndSession" = true,
        "scopes" = excluded."scopes",
        "updatedAt" = excluded."updatedAt",
        "name" = excluded."name",
        "redirectUris" = excluded."redirectUris",
        "postLogoutRedirectUris" = excluded."postLogoutRedirectUris",
        "tokenEndpointAuthMethod" = excluded."tokenEndpointAuthMethod",
        "applicationType" = excluded."applicationType",
        "grantTypes" = excluded."grantTypes",
        "responseTypes" = excluded."responseTypes",
        "requirePKCE" = excluded."requirePKCE",
        "subjectType" = excluded."subjectType"`,
      [
        id,
        clientId,
        storedSecret,
        body.skipConsent ?? true,
        JSON.stringify(["openid", "profile", "email", "offline_access"]),
        JSON.stringify([]),
        now,
        body.name.trim(),
        JSON.stringify(body.redirectUris),
        JSON.stringify(body.postLogoutRedirectUris ?? []),
        JSON.stringify(["authorization_code", "refresh_token"]),
        JSON.stringify(["code"]),
        body.requirePkce ?? true,
      ],
    );

    const client = {
      client_id: clientId,
      client_secret: clientSecret,
      client_name: body.name.trim(),
      redirect_uris: body.redirectUris,
      post_logout_redirect_uris: body.postLogoutRedirectUris ?? [],
    };
    return noStoreJson({ ok: true, client });
  } catch (error) {
    console.error("Better Auth client bootstrap failed", error);
    return noStoreJson(
      {
        ok: false,
        error: "client_bootstrap_failed",
        detail: error instanceof Error ? error.message.slice(0, 240) : "unknown_error",
      },
      { status: 500 },
    );
  } finally {
    await pool.end();
  }
};
