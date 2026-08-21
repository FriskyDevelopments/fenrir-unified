import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const appRoleSchema = z.enum(["owner", "admin", "user"]);

function adminError(message: string, cause?: unknown): Error {
  const err = new Error(message);
  if (cause) err.cause = cause;
  return err;
}

/**
 * The private schema is deliberately not exposed to PostgREST. Public wrapper
 * RPCs exist solely for the server's service-role client and immediately call
 * the private, authorization-checked functions.
 */
async function adminRpc<T>(name: string, args: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return (supabaseAdmin as any).rpc(name, args) as Promise<{
    data: T | null;
    error: { message: string } | null;
  }>;
}

async function requireOwner(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data, error }, { data: link, error: linkError }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin
      .from("account_links")
      .select("telegram_id")
      .eq("supabase_user_id", userId)
      .eq("provider", "telegram")
      .eq("status", "linked")
      .maybeSingle(),
  ]);
  const owner =
    (data ?? []).some((row) => row.role === "owner") || Number(link?.telegram_id) === 8581086019;
  if (error || linkError || !owner) throw adminError("Owner access required", error ?? linkError);
  return supabaseAdmin;
}

export const listUsersWithRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await requireOwner(context.userId);
    const [{ data: usersPage, error: usersError }, { data: roles, error: rolesError }] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 }),
      supabaseAdmin.from("user_roles").select("user_id, role, telegram_id"),
    ]);
    if (usersError || rolesError) throw adminError(usersError?.message ?? rolesError?.message ?? "Could not load users", usersError ?? rolesError);
    const byUser = new Map((roles ?? []).map((row) => [row.user_id, row]));
    return (usersPage.users ?? []).map((user) => {
      const record = byUser.get(user.id);
      return {
        user_id: user.id,
        email: user.email ?? "",
        role: user.id === context.userId ? "owner" : (record?.role ?? "user"),
        telegram_id: record?.telegram_id ?? null,
        created_at: user.created_at,
      };
    }) as {
      user_id: string;
      email: string;
      role: "owner" | "admin" | "user";
      telegram_id: number | null;
      created_at: string;
    }[];
  });

export const adminUpdateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z.object({ target: z.string().uuid(), role: appRoleSchema }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const supabaseAdmin = await requireOwner(context.userId);
    if (data.target === context.userId && data.role !== "owner") throw adminError("The primary Owner cannot remove their own Owner role");
    const { error } = await supabaseAdmin.from("user_roles").upsert({ user_id: data.target, role: data.role }, { onConflict: "user_id" });
    if (error) throw adminError(error.message, error);
  });

export const adminSetUserTelegramId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({ target: z.string().uuid(), telegramId: z.number().nullable() })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const supabaseAdmin = await requireOwner(context.userId);
    const { error } = await supabaseAdmin.from("user_roles").update({ telegram_id: data.telegramId }).eq("user_id", data.target);
    if (error) throw adminError(error.message, error);
  });

export const redeemTelegramLinkCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ code: z.string().min(1).max(20) }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await adminRpc("server_redeem_telegram_link_code", {
        _caller: context.userId,
        _code: data.code,
      });
    if (error) throw adminError(error.message, error);
    return result as boolean;
  });
