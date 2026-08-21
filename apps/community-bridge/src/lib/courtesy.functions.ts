import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CourtesyRecord = {
  telegram_user_id: string;
  duration: "30d" | "90d" | "6m";
  granted_by: string | number;
  granted_at: string;
  expires_at: number;
};

async function requireOwner(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error || !(data ?? []).some((row) => row.role === "owner")) {
    throw new Error("Owner access required");
  }
}

async function gatekeeperRequest(path: string, init?: RequestInit) {
  const secret = process.env["COMMUNITY_BRIDGE_OWNER_API_SECRET"]?.trim();
  if (!secret) throw new Error("Courtesy service is not configured");
  const response = await fetch(`https://fenrir-gatekeeper.hrgrrtks2p.workers.dev${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || body?.["ok"] !== true) {
    console.error("courtesy_request_failed", response.status, typeof body?.["error"] === "string" ? body["error"] : "invalid_response");
    throw new Error(typeof body?.["error"] === "string" ? body["error"] : "Courtesy service unavailable");
  }
  return body;
}

export const listCourtesies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireOwner(context.userId);
    const body = await gatekeeperRequest("/api/owner/courtesies");
    return (body["courtesies"] ?? []) as CourtesyRecord[];
  });

export const grantCourtesy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z.object({ telegramUserId: z.string().regex(/^\d{5,20}$/), duration: z.enum(["30d", "90d", "6m"]) }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await requireOwner(context.userId);
    const body = await gatekeeperRequest("/api/owner/courtesies", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return body["courtesy"] as CourtesyRecord;
  });

export const revokeCourtesy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ telegramUserId: z.string().regex(/^\d{5,20}$/) }).parse(data))
  .handler(async ({ context, data }) => {
    await requireOwner(context.userId);
    await gatekeeperRequest(`/api/owner/courtesies?telegramUserId=${encodeURIComponent(data.telegramUserId)}`, {
      method: "DELETE",
    });
  });
