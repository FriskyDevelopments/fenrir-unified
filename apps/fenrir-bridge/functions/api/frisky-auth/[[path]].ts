/**
 * Better Auth mount point for the shared @frisky/auth package.
 *
 * Disabled by default so production keeps the current Supabase / direct OAuth
 * path until Neon app_auth_* tables + provider console callbacks are ready.
 *
 * Enable with FRISKY_AUTH_ENABLED=1 and install @frisky/auth (see
 * docs/FRISKY_AUTH_MIGRATION.md). Copied from frisky-ui-kits/packages/auth/examples/pages-function.ts.
 */
import { noStoreJson } from "../../_lib/responses";

type Env = Record<string, string | undefined> & {
  FRISKY_AUTH_ENABLED?: string;
  NEON_DATABASE_URL?: string;
};

function enabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (!enabled(context.env.FRISKY_AUTH_ENABLED)) {
    return noStoreJson(
      {
        ok: false,
        error: "frisky_auth_not_enabled",
        product: "fenrir-bridge",
        detail: {
          message:
            "Shared @frisky/auth is scaffolded but not enabled. Keep Supabase/direct OAuth until Neon app_auth_* + provider callbacks are cut over. See docs/FRISKY_AUTH_MIGRATION.md.",
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
        detail: { message: "NEON_DATABASE_URL is required for @frisky/auth." },
      },
      { status: 503 },
    );
  }

  try {
    const { Pool } = await import("@neondatabase/serverless");
    // Dynamic import keeps deploy green when @frisky/auth is not yet a dependency.
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
          hint: "Install @frisky/auth and apply Neon app_auth_* tables before enabling FRISKY_AUTH_ENABLED.",
        },
      },
      { status: 503 },
    );
  }
};
