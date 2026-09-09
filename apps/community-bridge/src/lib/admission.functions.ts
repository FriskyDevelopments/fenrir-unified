import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Minimum admission conditions a member must meet — beyond signing in — before
 * the community bot lets them into the group. Staff configure them here; the
 * bot reads `public.admission_requirements` with service_role and enforces
 * them on join. Writes are protected by RLS (staff only).
 */

export interface AdmissionRequirements {
  community_id: string;
  require_username: boolean;
  require_profile_photo: boolean;
  min_account_age_days: number;
}

export const DEFAULT_ADMISSION_REQUIREMENTS: Omit<AdmissionRequirements, "community_id"> = {
  require_username: false,
  require_profile_photo: false,
  min_account_age_days: 0,
};

export const getAdmissionRequirements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ communityId: z.string().min(1).max(100) }).parse(data))
  .handler(async ({ context, data }): Promise<AdmissionRequirements> => {
    const { data: row, error } = await context.supabase
      .from("admission_requirements")
      .select("community_id, require_username, require_profile_photo, min_account_age_days")
      .eq("community_id", data.communityId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? { community_id: data.communityId, ...DEFAULT_ADMISSION_REQUIREMENTS };
  });

export interface WhitelistEntry {
  id: string;
  community_id: string;
  telegram_id: number;
  note: string | null;
  created_at: string;
}

/** Staff-only (RLS): Telegram accounts exempt from the admission checks. */
export const listAdmissionWhitelist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ communityId: z.string().min(1).max(100) }).parse(data))
  .handler(async ({ context, data }): Promise<WhitelistEntry[]> => {
    const { data: rows, error } = await context.supabase
      .from("admission_whitelist")
      .select("id, community_id, telegram_id, note, created_at")
      .eq("community_id", data.communityId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addToAdmissionWhitelist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        communityId: z.string().min(1).max(100),
        telegramId: z.number().int().positive(),
        note: z.string().max(200).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("admission_whitelist").upsert(
      {
        community_id: data.communityId,
        telegram_id: data.telegramId,
        note: data.note ?? null,
        added_by: context.userId,
      },
      // DO NOTHING on duplicates — there is deliberately no UPDATE policy.
      { onConflict: "community_id,telegram_id", ignoreDuplicates: true },
    );
    if (error) {
      throw new Error(
        /row-level security|permission/i.test(error.message)
          ? "Only staff can manage the whitelist."
          : error.message,
      );
    }
  });

export const removeFromAdmissionWhitelist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("admission_whitelist").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
  });

export const saveAdmissionRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        communityId: z.string().min(1).max(100),
        requireUsername: z.boolean(),
        requireProfilePhoto: z.boolean(),
        minAccountAgeDays: z.number().int().min(0).max(3650),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("admission_requirements").upsert(
      {
        community_id: data.communityId,
        require_username: data.requireUsername,
        require_profile_photo: data.requireProfilePhoto,
        min_account_age_days: data.minAccountAgeDays,
        updated_by: context.userId,
      },
      { onConflict: "community_id" },
    );
    if (error) {
      throw new Error(
        /row-level security|permission/i.test(error.message)
          ? "Only staff can change admission requirements."
          : error.message,
      );
    }
  });
