import { Pool } from "@neondatabase/serverless";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";

import type { BillingEnv } from "./billing-env";

export const FRISKY_AUTH_ORIGIN = "https://auth.myfenrir.com";
export const FRISKY_AUTH_BASE_PATH = "/api/auth";

export type FriskyBetterAuthEnv = BillingEnv & {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_ENABLED?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  BETTER_AUTH_MIGRATION_ENABLED?: string;
  BETTER_AUTH_MIGRATION_TOKEN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  MICROSOFT_TENANT_ID?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  APPLE_APP_BUNDLE_IDENTIFIER?: string;
};

export type FriskySocialProvider = "apple" | "google" | "microsoft";

const nonEmpty = (value: string | undefined) => value?.trim() || undefined;

export function configuredBetterAuthProviders(env: FriskyBetterAuthEnv): FriskySocialProvider[] {
  const providers: FriskySocialProvider[] = [];
  if (nonEmpty(env.GOOGLE_CLIENT_ID) && nonEmpty(env.GOOGLE_CLIENT_SECRET)) providers.push("google");
  if (nonEmpty(env.MICROSOFT_CLIENT_ID) && nonEmpty(env.MICROSOFT_CLIENT_SECRET)) providers.push("microsoft");
  if (nonEmpty(env.APPLE_CLIENT_ID) && nonEmpty(env.APPLE_CLIENT_SECRET)) providers.push("apple");
  return providers;
}

export function isFriskySocialProvider(value: unknown): value is FriskySocialProvider {
  return value === "apple" || value === "google" || value === "microsoft";
}

export function betterAuthOrigin(env: FriskyBetterAuthEnv): string {
  return nonEmpty(env.BETTER_AUTH_URL)?.replace(/\/$/, "") || FRISKY_AUTH_ORIGIN;
}

function requireAuthEnv(value: string | undefined, name: string): string {
  const clean = nonEmpty(value);
  if (!clean) throw new Error(`missing_env:${name}`);
  return clean;
}

function trustedOrigins(env: FriskyBetterAuthEnv): string[] {
  const configured = (env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);

  return Array.from(
    new Set([
      betterAuthOrigin(env),
      "https://myfenrir.com",
      "https://www.myfenrir.com",
      "https://community.myfenrir.com",
      "https://lore.myfenrir.com",
      "https://hostcasa.app",
      "https://folios.works",
      "https://clipsflow.tech",
      "http://localhost:5173",
      "http://localhost:3080",
      ...configured,
    ]),
  );
}

/**
 * Builds the Better Auth server for exactly one request. Neon serverless pools
 * cannot safely outlive a Workers request, so every caller must close `pool` in
 * a `finally` block.
 */
export function createFriskyBetterAuth(env: FriskyBetterAuthEnv) {
  const pool = new Pool({
    connectionString: requireAuthEnv(env.NEON_DATABASE_URL, "NEON_DATABASE_URL"),
  });

  const socialProviders: Record<string, Record<string, unknown>> = {};

  if (nonEmpty(env.GOOGLE_CLIENT_ID) && nonEmpty(env.GOOGLE_CLIENT_SECRET)) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID!.trim(),
      clientSecret: env.GOOGLE_CLIENT_SECRET!.trim(),
      prompt: "select_account",
    };
  }

  if (nonEmpty(env.MICROSOFT_CLIENT_ID) && nonEmpty(env.MICROSOFT_CLIENT_SECRET)) {
    socialProviders.microsoft = {
      clientId: env.MICROSOFT_CLIENT_ID!.trim(),
      clientSecret: env.MICROSOFT_CLIENT_SECRET!.trim(),
      tenantId: nonEmpty(env.MICROSOFT_TENANT_ID) ?? "common",
      prompt: "select_account",
    };
  }

  if (nonEmpty(env.APPLE_CLIENT_ID) && nonEmpty(env.APPLE_CLIENT_SECRET)) {
    socialProviders.apple = {
      clientId: env.APPLE_CLIENT_ID!.trim(),
      clientSecret: env.APPLE_CLIENT_SECRET!.trim(),
      ...(nonEmpty(env.APPLE_APP_BUNDLE_IDENTIFIER)
        ? { appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER!.trim() }
        : {}),
    };
  }

  const auth = betterAuth({
    database: pool,
    secret: requireAuthEnv(env.BETTER_AUTH_SECRET, "BETTER_AUTH_SECRET"),
    baseURL: betterAuthOrigin(env),
    basePath: FRISKY_AUTH_BASE_PATH,
    socialProviders,
    trustedOrigins: trustedOrigins(env),
    advanced: {
      cookiePrefix: "frisky_app_auth",
      useSecureCookies: true,
      crossSubDomainCookies: {
        enabled: true,
        domain: ".myfenrir.com",
      },
      database: { joins: true },
    },
    user: { modelName: "app_auth_user" },
    session: { modelName: "app_auth_session" },
    account: { modelName: "app_auth_account" },
    verification: { modelName: "app_auth_verification" },
    plugins: [
      jwt({
        disableSettingJwtHeader: true,
        jwks: {
          keyPairConfig: { alg: "EdDSA", crv: "Ed25519" },
          rotationInterval: 60 * 60 * 24 * 30,
          gracePeriod: 60 * 60 * 24 * 45,
        },
        schema: { jwks: { modelName: "app_auth_jwks" } },
      }),
      oauthProvider({
        loginPage: "/sign-in",
        consentPage: "/consent",
        scopes: ["openid", "profile", "email", "offline_access"],
        grantTypes: ["authorization_code", "refresh_token"],
        allowDynamicClientRegistration: false,
        allowUnauthenticatedClientRegistration: false,
        accessTokenExpiresIn: 60 * 60,
        idTokenExpiresIn: 60 * 60,
        refreshTokenExpiresIn: 60 * 60 * 24 * 30,
        schema: {
          oauthClient: { modelName: "app_auth_oauth_client" },
          oauthResource: { modelName: "app_auth_oauth_resource" },
          oauthClientResource: { modelName: "app_auth_oauth_client_resource" },
          oauthAccessToken: { modelName: "app_auth_oauth_access_token" },
          oauthRefreshToken: { modelName: "app_auth_oauth_refresh_token" },
          oauthConsent: { modelName: "app_auth_oauth_consent" },
        },
      }),
    ],
  });

  return { auth, pool };
}

export async function handleBetterAuth(request: Request, env: FriskyBetterAuthEnv): Promise<Response> {
  const { auth, pool } = createFriskyBetterAuth(env);
  try {
    return await auth.handler(request);
  } finally {
    await pool.end();
  }
}

export function truthy(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

export function betterAuthEnabled(env: FriskyBetterAuthEnv): boolean {
  return truthy(env.BETTER_AUTH_ENABLED);
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}
