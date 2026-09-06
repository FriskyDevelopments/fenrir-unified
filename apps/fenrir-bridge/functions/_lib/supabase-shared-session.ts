// Additive Fenrir → Supabase shared-session bridge.
//
// The Community Gate mints its own Neon-backed session cookie. Community Bridge
// (communities.myfenrir.com) authenticates with SUPABASE and reads the
// `sb-<ref>-auth-token` cookie. To make ONE identity span both surfaces, after
// a successful gate sign-in we ALSO mint a real Supabase session for the same
// email and set its cookie scoped to `.myfenrir.com`, so communities.myfenrir.com
// recognizes the session natively — no separate handoff, no re-verify.
//
// This is strictly ADDITIVE and best-effort: any failure returns [] and the
// existing Neon gate session is untouched. Reuses the exact, proven logic from
// functions/api/auth/community-sso.ts.

export type SupabaseSharedEnv = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

const STORAGE_CHUNK_SIZE = 3000;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

function sessionCookies(storageKey: string, value: string): string[] {
  const encodedName = encodeURIComponent(storageKey);
  const encodedValue = encodeURIComponent(value);
  const attributes = `Path=/; Domain=.myfenrir.com; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax; Secure`;
  if (encodedValue.length <= STORAGE_CHUNK_SIZE) {
    return [`${encodedName}=${encodedValue}; ${attributes}`];
  }
  const cookies: string[] = [];
  for (let index = 0; index * STORAGE_CHUNK_SIZE < encodedValue.length; index += 1) {
    cookies.push(
      `${encodedName}.${index}=${encodedValue.slice(index * STORAGE_CHUNK_SIZE, (index + 1) * STORAGE_CHUNK_SIZE)}; ${attributes}`,
    );
  }
  return cookies;
}

/**
 * Mint a real Supabase session for `email` and return the `Set-Cookie` strings
 * (scoped to `.myfenrir.com`). Best-effort: returns [] on any failure.
 */
export async function mintSupabaseSharedSessionCookies(
  env: SupabaseSharedEnv,
  email: string,
  meta?: { name?: string | null; fenrirUserId?: string | null },
): Promise<string[]> {
  try {
    const supabaseUrl = env.SUPABASE_URL?.trim().replace(/\/$/, "");
    const anonKey = env.SUPABASE_ANON_KEY?.trim();
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (!supabaseUrl || !anonKey || !serviceKey || !normalizedEmail) {
      console.error("supabase_shared_session_skipped", {
        hasUrl: Boolean(supabaseUrl),
        hasAnon: Boolean(anonKey),
        hasService: Boolean(serviceKey),
        hasEmail: Boolean(normalizedEmail),
      });
      return [];
    }

    const linkResponse = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "magiclink",
        email: normalizedEmail,
        options: {
          data: {
            full_name: meta?.name ?? undefined,
            fenrir_user_id: meta?.fenrirUserId ?? undefined,
          },
        },
      }),
    });
    const link = (await linkResponse.json().catch(() => null)) as { hashed_token?: string } | null;
    if (!linkResponse.ok || !link?.hashed_token) {
      console.error("supabase_generate_link_failed", linkResponse.status);
      return [];
    }

    const verifyResponse = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ token_hash: link.hashed_token, type: "magiclink" }),
    });
    const auth = (await verifyResponse.json().catch(() => null)) as
      | { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; user?: unknown }
      | null;
    if (!verifyResponse.ok || !auth?.access_token || !auth.refresh_token || !auth.user) {
      console.error("supabase_verify_failed", verifyResponse.status);
      return [];
    }

    const ref = new URL(supabaseUrl).hostname.split(".")[0] || "auth";
    const value = JSON.stringify({
      access_token: auth.access_token,
      refresh_token: auth.refresh_token,
      expires_in: auth.expires_in ?? 3600,
      expires_at: Math.floor(Date.now() / 1000) + (auth.expires_in ?? 3600),
      token_type: auth.token_type ?? "bearer",
      user: auth.user,
    });
    return sessionCookies(`sb-${ref}-auth-token`, value);
  } catch (error) {
    console.error("supabase_shared_session_failed", error instanceof Error ? error.message : "unknown");
    return [];
  }
}
