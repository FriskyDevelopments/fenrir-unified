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

export const listUsersWithRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await adminRpc("server_list_users_with_roles", { _caller: context.userId });
    if (error) throw adminError(error.message, error);
    return (data ?? []) as {
      user_id: string;
      email: string;
      role: "owner" | "admin" | "user";
      telegram_id: number | null;
      created_at: string;
    }[];
  });

export const adminUpdateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ target: z.string().uuid(), role: appRoleSchema }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await adminRpc("server_admin_update_user_role", {
        _caller: context.userId,
        _target: data.target,
        _role: data.role,
      });
    if (error) throw adminError(error.message, error);
  });

export const adminSetUserTelegramId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ target: z.string().uuid(), telegramId: z.number().nullable() })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await adminRpc("server_admin_set_user_telegram_id", {
        _caller: context.userId,
        _target: data.target,
        _telegram_id: data.telegramId,
      });
    if (error) throw adminError(error.message, error);
  });

export const redeemTelegramLinkCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ code: z.string().min(1).max(20) }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await adminRpc("server_redeem_telegram_link_code", {
        _caller: context.userId,
        _code: data.code,
      });
    if (error) throw adminError(error.message, error);
    return result as boolean;
  });
