import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { neonSql } from "@/lib/neon.server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Escaneo de nombres de usuario / handles.
 *
 * Los términos viven en Neon (`cb_blocked_terms`), no en el código, PORQUE
 * rotan constantemente: hay que poder añadir uno sin desplegar.
 *
 * Sobre el contenido de la lista: este repo NO trae términos sembrados a
 * propósito. Una lista de la jerga usada para anunciar material de abuso
 * infantil es, literalmente, un índice para encontrarlo — no es algo que deba
 * quedar escrito en un repositorio. Las listas se obtienen de las
 * organizaciones que las mantienen bajo acuerdo (IWF, Thorn, NCMEC) y se
 * cargan en la tabla; el mecanismo está listo para recibirlas.
 */

const NOT_STAFF = "Only staff can manage blocked terms.";

type AuthedContext = {
  supabase: SupabaseClient;
  userId: string;
  claims: Record<string, unknown>;
};

async function assertStaff(context: AuthedContext): Promise<void> {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(NOT_STAFF);
  const roles = ((data ?? []) as Array<{ role: string }>).map((r) => r.role);
  if (!roles.includes("owner") && !roles.includes("admin")) throw new Error(NOT_STAFF);
}

/**
 * Normaliza para que las evasiones baratas no funcionen: mayúsculas,
 * separadores intercalados (`t.e.r.m`, `t_e_r_m`) y leetspeak básico.
 * No pretende ser exhaustivo — ninguna normalización lo es — pero cubre lo
 * que se intenta primero.
 */
export function normalizeHandle(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(
      /[04135$@]/g,
      (c) => ({ "0": "o", "4": "a", "1": "i", "3": "e", "5": "s", $: "s", "@": "a" })[c] ?? c,
    )
    .replace(/[^a-z0-9]/g, "");
}

export type HandleDecision = "allow" | "review" | "block";

export interface HandleVerdict {
  decision: HandleDecision;
  /** Término que disparó la decisión. Nunca se devuelve al usuario final. */
  matched: string | null;
}

/**
 * Revisa un handle. Devuelve `block` si coincide con un término de bloqueo y
 * `review` si coincide con uno marcado para revisión humana.
 */
export const checkHandle = createServerFn({ method: "POST" })
  .validator((data) => z.object({ handle: z.string().trim().min(1).max(120) }).parse(data))
  .handler(async ({ data }): Promise<HandleVerdict> => {
    const normalized = normalizeHandle(data.handle);
    if (!normalized) return { decision: "allow", matched: null };

    const sql = neonSql();
    const rows = (await sql`
      select term, match_kind, severity from cb_blocked_terms
    `) as Array<{ term: string; match_kind: string; severity: string }>;

    let review: string | null = null;
    for (const row of rows) {
      const term = normalizeHandle(row.term);
      if (!term) continue;
      const hit =
        row.match_kind === "word"
          ? new RegExp(`(^|[^a-z0-9])${term}([^a-z0-9]|$)`).test(normalized)
          : normalized.includes(term);
      if (!hit) continue;
      // `block` gana sobre `review` y corta de inmediato.
      if (row.severity === "block") return { decision: "block", matched: row.term };
      review ??= row.term;
    }

    return review ? { decision: "review", matched: review } : { decision: "allow", matched: null };
  });

/** La lista, para la consola de staff. */
export const listBlockedTerms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as unknown as AuthedContext);
    const sql = neonSql();
    const rows = (await sql`
      select id, term, match_kind, severity, note, created_at
      from cb_blocked_terms order by created_at desc limit 500
    `) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row["id"]),
      term: String(row["term"]),
      match_kind: String(row["match_kind"]),
      severity: String(row["severity"]),
      note: (row["note"] as string | null) ?? null,
      created_at:
        row["created_at"] instanceof Date
          ? (row["created_at"] as Date).toISOString()
          : String(row["created_at"]),
    }));
  });

/** Añadir un término sin desplegar — que es el punto de tenerlo en tabla. */
export const addBlockedTerm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        term: z.string().trim().min(2).max(120),
        match_kind: z.enum(["substring", "word"]).default("substring"),
        severity: z.enum(["block", "review"]).default("block"),
        note: z.string().trim().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context as unknown as AuthedContext);
    const sql = neonSql();
    const rows = (await sql`
      insert into cb_blocked_terms (term, match_kind, severity, note, added_by)
      values (${data.term.toLowerCase()}, ${data.match_kind}, ${data.severity}, ${data.note ?? null}, ${context.userId})
      on conflict (term) do nothing
      returning id
    `) as Array<{ id: string }>;
    return { added: rows.length > 0 };
  });

export const removeBlockedTerm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    await assertStaff(context as unknown as AuthedContext);
    const sql = neonSql();
    await sql`delete from cb_blocked_terms where id = ${data.id}`;
    return { ok: true };
  });
