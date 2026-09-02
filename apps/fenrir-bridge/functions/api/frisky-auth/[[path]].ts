/**
 * Better Auth mount point for the shared @frisky/auth package.
 *
 * App login (who is this user?) lives here. Community Gate membership
 * (is this user a member of this community?) stays on /api/community-gate/*
 * and /api/community-auth/* — those routes are not this handler.
 *
 * Enable with FRISKY_AUTH_ENABLED=1 after Neon app_auth_* tables and
 * provider console callbacks are ready. See docs/FRISKY_AUTH_MIGRATION.md.
 *
 * Authentik is not Fenrir identity. Do not point this mount at Authentik.
 */
import { noStoreJson } from "../../_lib/responses";
import { friskyAuthEnabled } from "../../_lib/frisky-auth";

type Env = Record<string, string | undefined> & {
  FRISKY_AUTH_ENABLED?: string;
  NEON_DATABASE_URL?: string;
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (!friskyAuthEnabled(context.env)) {
    return noStoreJson(
      {
        ok: false,
        error: "frisky_auth_not_enabled",
        product: "fenrir-bridge",
        detail: {
          message:
            "Better Auth (@frisky/auth) is the Fenrir app identity plane but is not enabled in this environment. Set FRISKY_AUTH_ENABLED=1, BETTER_AUTH_SECRET, provider client IDs, and NEON_DATABASE_URL after applying packages/auth/sql/app_auth.sql. Authentik is retired leftover — do not wire it back.",
        },
      },
      { status: 503 },
    );
  }

  if (!context.env.NEON_DATABASE_URL) {
    return noStoreJson(
      {
        ok: false,
        error: "frisky_auth_missing_neon",
        detail: { message: "NEON_DATABASE_URL is required for @frisky/auth app_auth_* tables." },
      },
      { status: 503 },
    );
  }

  try {
    const { Pool } = await import("@neondatabase/serverless");
    const authMod = await import("@frisky/auth/server");
    const pool = new Pool({
      connectionString: authMod.neonConnectionString(context.env),
    });
    try {
      const auth = authMod.createFriskyAuth(
        authMod.authOptionsFromEnv({
          env: context.env,
          database: pool,
          baseURL: new URL(context.request.url).origin,
        }),
      );
      return await auth.handler(context.request);
    } finally {
      await pool.end();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "frisky_auth_boot_failed";
    return noStoreJson(
      {
        ok: false,
        error: "frisky_auth_boot_failed",
        detail: {
          message,
          hint: "Install @frisky/auth, apply packages/auth/sql/app_auth.sql, and set Better Auth secrets before enabling FRISKY_AUTH_ENABLED.",
        },
      },
      { status: 503 },
    );
  }
};
