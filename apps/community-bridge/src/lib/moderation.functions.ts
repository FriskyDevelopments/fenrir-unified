import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { neonSql } from "@/lib/neon.server";

/**
 * Cola de revisión humana (Neon `cb_moderation_reviews`).
 *
 * Aquí aterriza SOLO la duda del clasificador — nunca lo evidente. Lo que el
 * servicio de moderación marca como `reject` (edad claramente por debajo del
 * mínimo) se bloquea de inmediato y no entra: nadie de este equipo debería
 * tener que mirar eso para tomar una decisión que ya está tomada.
 *
 * La fila guarda una REFERENCIA al objeto, nunca una copia de la imagen.
 */

const NOT_STAFF = "Only staff can review moderation items.";

type AuthedContext = {
  supabase: { from: (table: string) => any };
  userId: string;
  claims: Record<string, unknown>;
};

/** Sin RLS en Neon, el gate de staff es explícito (roles viven en Supabase). */
async function assertStaff(context: AuthedContext): Promise<void> {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(NOT_STAFF);
  const roles = ((data ?? []) as Array<{ role: string }>).map((r) => r.role);
  if (!roles.includes("owner") && !roles.includes("admin")) throw new Error(NOT_STAFF);
}

export type ReviewStatus = "pending" | "approved" | "rejected";
export type ReviewReason = "no_age_reading" | "age_near_threshold" | "reported" | "other";

export interface ModerationReview {
  id: string;
  community_id: string;
  subject_ref: string;
  subject_kind: string;
  reason: ReviewReason;
  apparent_age: number | null;
  explicit: boolean | null;
  classifier_model: string | null;
  status: ReviewStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

function toReview(row: Record<string, unknown>): ModerationReview {
  const iso = (value: unknown) =>
    value instanceof Date ? value.toISOString() : ((value as string | null) ?? null);
  return {
    id: String(row["id"]),
    community_id: String(row["community_id"]),
    subject_ref: String(row["subject_ref"]),
    subject_kind: String(row["subject_kind"]),
    reason: row["reason"] as ReviewReason,
    apparent_age: (row["apparent_age"] as number | null) ?? null,
    explicit: (row["explicit"] as boolean | null) ?? null,
    classifier_model: (row["classifier_model"] as string | null) ?? null,
    status: row["status"] as ReviewStatus,
    decided_by: (row["decided_by"] as string | null) ?? null,
    decided_at: iso(row["decided_at"]),
    decision_note: (row["decision_note"] as string | null) ?? null,
    created_at: iso(row["created_at"]) ?? new Date(0).toISOString(),
  };
}

/** La cola. Por defecto lo pendiente, que es lo único accionable. */
export const listModerationReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        status: z.enum(["pending", "approved", "rejected"]).default("pending"),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context as unknown as AuthedContext);
    const sql = neonSql();
    const rows = (await sql`
      select id, community_id, subject_ref, subject_kind, reason, apparent_age, explicit,
             classifier_model, status, decided_by, decided_at, decision_note, created_at
      from cb_moderation_reviews
      where status = ${data.status}
      order by created_at asc
      limit ${data.limit}
    `) as Array<Record<string, unknown>>;
    return rows.map(toReview);
  });

/** Cuántos esperan — para el badge del menú, sin traerse la cola entera. */
export const countPendingReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as unknown as AuthedContext);
    const sql = neonSql();
    const rows = (await sql`
      select count(*)::int as pending from cb_moderation_reviews where status = 'pending'
    `) as Array<{ pending: number }>;
    return rows[0]?.pending ?? 0;
  });

/**
 * Resolver un ítem. Queda registrado quién y cuándo: una decisión de moderación
 * sin autor no sirve para auditar nada.
 */
export const decideModerationReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context as unknown as AuthedContext);
    const sql = neonSql();
    const rows = (await sql`
      update cb_moderation_reviews
      set status = ${data.decision},
          decided_by = ${context.userId},
          decided_at = now(),
          decision_note = ${data.note ?? null}
      where id = ${data.id} and status = 'pending'
      returning id
    `) as Array<{ id: string }>;
    // Sin fila: alguien más ya lo resolvió. No es un error, es una carrera.
    return { ok: rows.length > 0, alreadyDecided: rows.length === 0 };
  });

/**
 * Encolar. Lo llama el pipeline de moderación cuando el clasificador devuelve
 * `review`; idempotente por (subject_ref, pending) para que un reintento no
 * duplique la fila.
 */
export const enqueueModerationReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        community_id: z.string().trim().min(1).max(60),
        subject_ref: z.string().trim().min(1).max(500),
        subject_kind: z.enum(["gate_media", "brand_asset", "telegram_photo", "username"]),
        reason: z.enum(["no_age_reading", "age_near_threshold", "reported", "other"]),
        apparent_age: z.number().int().min(0).max(120).nullable().optional(),
        explicit: z.boolean().nullable().optional(),
        classifier_model: z.string().trim().max(200).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context as unknown as AuthedContext);
    const sql = neonSql();
    const existing = (await sql`
      select id from cb_moderation_reviews
      where subject_ref = ${data.subject_ref} and status = 'pending'
      limit 1
    `) as Array<{ id: string }>;
    if (existing[0]) return { id: existing[0].id, created: false };

    const rows = (await sql`
      insert into cb_moderation_reviews
        (community_id, subject_ref, subject_kind, reason, apparent_age, explicit, classifier_model)
      values
        (${data.community_id}, ${data.subject_ref}, ${data.subject_kind}, ${data.reason},
         ${data.apparent_age ?? null}, ${data.explicit ?? null}, ${data.classifier_model ?? null})
      returning id
    `) as Array<{ id: string }>;
    return { id: rows[0]!.id, created: true };
  });
