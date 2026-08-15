import { createSessionPayload } from "./auth";
import { upsertProfileForSession } from "./supabase-profiles";
import { ensureDefaultWorkspace } from "./workspaces";
import type { BillingEnv } from "./billing-env";

type SupabaseEnv = BillingEnv & {
  SUPABASE_ADMIN_EMAILS?: string;
};

// These public browser credentials are already embedded in the frontend.
// Preview Pages Functions must use the same project when preview variables are
// absent, otherwise OAuth succeeds but the Fenrir session exchange cannot run.
export const defaultSupabaseUrl = "https://yqevglppbhuoxxfsfnih.supabase.co";
export const defaultSupabaseAnonKey = "sb_publishable_t8xng5GIhOmAtT4Nsf7Zgg_TO36FTTE";

type SupabaseUserResponse = {
  id?: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
  };
  app_metadata?: {
    provider?: string;
  };
};

export async function createSessionFromSupabaseToken(accessToken: string, env: SupabaseEnv) {
  const supabaseUrl = (env.SUPABASE_URL?.trim() || defaultSupabaseUrl).replace(/\/$/, "");
  if (supabaseUrl.includes("example.supabase.co") || supabaseUrl.includes("<your-project-ref>")) {
    console.error(`Supabase URL misconfigured in edge function: ${supabaseUrl}`);
    throw new Error("supabase_url_misconfigured");
  }
  const anonKey = env.SUPABASE_ANON_KEY?.trim() || defaultSupabaseAnonKey;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error("supabase_invalid_access_token");
  }

  const user = await response.json<SupabaseUserResponse>();
  if (!user.email) {
    throw new Error("supabase_missing_email");
  }
  if (!user.id) {
    throw new Error("supabase_missing_user_id");
  }

  const allowedAdmins = parseAdminEmails(env.SUPABASE_ADMIN_EMAILS);
  if (allowedAdmins.length > 0 && !allowedAdmins.includes(user.email.toLowerCase())) {
    throw new Error("supabase_admin_not_allowed");
  }

  const session = createSessionPayload({
    email: user.email,
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email.split("@")[0],
    provider: sessionProvider(user.app_metadata?.provider),
    identityId: `supabase:${user.id}`
  });
  const canonical = env.DB ? await ensureDefaultWorkspace(env.DB, session) : session;
  await upsertProfileForSession(env, canonical, user.id);
  return canonical;
}

function parseAdminEmails(value?: string) {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function sessionProvider(provider?: string) {
  if (provider === "azure") return "microsoft";
  if (provider === "apple") return "apple";
  return "google";
}
