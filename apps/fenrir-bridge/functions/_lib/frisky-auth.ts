import { createSessionPayload, type AuthEnv, type SessionPayload } from "./auth";
import type { OAuthEnv } from "./oauth";

export type FriskyAuthRuntimeEnv = AuthEnv &
  OAuthEnv & {
    FRISKY_AUTH_ENABLED?: string;
    BETTER_AUTH_SECRET?: string;
    FRISKY_AUTH_SECRET?: string;
    NEON_DATABASE_URL?: string;
    FENRIR_ALLOWED_ORIGINS?: string;
  };

/**
 * Determines whether a configuration value represents an enabled setting.
 *
 * @param value - The value to evaluate
 * @returns `true` if the trimmed, case-insensitive value is `"1"`, `"true"`, `"yes"`, or `"on"`, `false` otherwise.
 */
function enabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

/**
 * Determines whether Frisky Auth is enabled in the environment.
 *
 * @returns `true` if `FRISKY_AUTH_ENABLED` represents an enabled value, `false` otherwise.
 */
export function friskyAuthEnabled(env: { FRISKY_AUTH_ENABLED?: string }): boolean {
  return enabled(env.FRISKY_AUTH_ENABLED);
}

/**
 * Loads the authenticated Frisky session for a request.
 *
 * @returns The session payload when authentication succeeds and user identity data is available; `null` otherwise.
 */
export async function readFriskyAuthSession(
  request: Request,
  env: FriskyAuthRuntimeEnv,
): Promise<SessionPayload | null> {
  if (!friskyAuthEnabled(env) || !env.NEON_DATABASE_URL?.trim()) return null;

  const { Pool } = await import("@neondatabase/serverless");
  const authMod = await import("@frisky/auth/server");
  const pool = new Pool({ connectionString: authMod.neonConnectionString(env) });
  try {
    const auth = authMod.createFriskyAuth(
      authMod.authOptionsFromEnv({
        env,
        database: pool,
        baseURL: new URL(request.url).origin,
      }),
    );
    const result = await auth.api.getSession({ headers: request.headers });
    if (!result?.user?.id || !result.user.email) return null;
    return createSessionPayload({
      email: result.user.email,
      name: result.user.name?.trim() || result.user.email,
      provider: "frisky",
      identityId: result.user.id,
    });
  } catch {
    return null;
  } finally {
    await pool.end();
  }
}

/**
 * Signs out the authenticated user associated with the request.
 *
 * @param request - The request containing the user's authentication headers
 * @param env - Runtime configuration for Frisky Auth and the database
 * @returns The sign-out response headers, or `null` when sign-out cannot be completed
 */
export async function signOutFriskyAuth(request: Request, env: FriskyAuthRuntimeEnv): Promise<Headers | null> {
  if (!friskyAuthEnabled(env) || !env.NEON_DATABASE_URL?.trim()) return null;

  const { Pool } = await import("@neondatabase/serverless");
  const authMod = await import("@frisky/auth/server");
  const pool = new Pool({ connectionString: authMod.neonConnectionString(env) });
  try {
    const auth = authMod.createFriskyAuth(
      authMod.authOptionsFromEnv({
        env,
        database: pool,
        baseURL: new URL(request.url).origin,
      }),
    );
    const response = await auth.api.signOut({
      headers: request.headers,
      asResponse: true,
    });
    return response.headers;
  } catch {
    return null;
  } finally {
    await pool.end();
  }
}
