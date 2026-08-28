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

function enabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

export function friskyAuthEnabled(env: { FRISKY_AUTH_ENABLED?: string }): boolean {
  return enabled(env.FRISKY_AUTH_ENABLED);
}

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
