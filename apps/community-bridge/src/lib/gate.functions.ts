import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUniqueViolation, neonSql } from "@/lib/neon.server";
import type { GateConfig } from "@/lib/gate-presets";

// Datos en Neon (cb_gate_configs); la sesión/identidad sigue siendo Supabase.
const GATE_COLUMNS =
  "slug, preset, headline, subheadline, logo_url, mascot_url, background_url";
const GATE_RECORD_COLUMNS = `id, updated_at, brand_id, community_id, ${GATE_COLUMNS}`;

export interface GateRecord extends GateConfig {
  id: string;
  updated_at: string;
  brand_id: string;
  community_id: string | null;
}

const urlField = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v === "" || v.startsWith("/") || v.startsWith("https://"), {
    message: "Use a public https:// URL",
  })
  .transform((v) => (v === "" ? null : v))
  .nullable();

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "3–40 lowercase letters, numbers or dashes");

/**
 * Tenant key. Every authenticated gate query is scoped to it, so a session
 * acting for one brand can never read or write another tenant's gates —
 * ownership (`user_id`) alone is not enough in a white-label deployment.
 */
const tenantField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "Invalid brand");

const tenantSchema = z.object({
  brand_id: tenantField,
  community_id: tenantField.nullable().optional(),
});

const configSchema = tenantSchema.extend({
  slug: slugField,
  preset: z.string().trim().min(1).max(40),
  headline: z.string().trim().min(1).max(80),
  subheadline: z.string().trim().max(160),
  logo_url: urlField,
  mascot_url: urlField,
  background_url: urlField,
});

const SLUG_TAKEN = "That gate address is already taken — pick another one.";
const WRONG_TENANT = "That gate belongs to a different brand.";

type GateRow = Record<string, unknown>;

function toRecord(row: GateRow): GateRecord {
  return {
    id: String(row["id"]),
    updated_at: new Date(row["updated_at"] as string | Date).toISOString(),
    brand_id: String(row["brand_id"]),
    community_id: (row["community_id"] as string | null) ?? null,
    slug: String(row["slug"]),
    preset: String(row["preset"]),
    headline: String(row["headline"]),
    subheadline: String(row["subheadline"] ?? ""),
    logo_url: (row["logo_url"] as string | null) ?? null,
    mascot_url: (row["mascot_url"] as string | null) ?? null,
    background_url: (row["background_url"] as string | null) ?? null,
  } as GateRecord;
}

/**
 * Every gate owned by the signed-in user.
 *
 * The owner dashboard is deliberately not narrowed by the visual brand that
 * happened to load at the current hostname. A single owner can create gates
 * for several brands; filtering here made those gates look deleted whenever
 * they returned through another branded entry point. The ownership predicate
 * remains mandatory, so this never crosses account boundaries.
 */
export const listMyGates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => undefined)
  .handler(async ({ context }) => {
    const sql = neonSql();
    const rows = (await sql`
      select id, updated_at, brand_id, community_id, slug, preset, headline, subheadline, logo_url, mascot_url, background_url
      from cb_gate_configs
      where user_id = ${context.userId}
      order by created_at asc
    `) as GateRow[];
    return rows.map(toRecord);
  });

/** One gate owned by the signed-in user in this brand (null otherwise). */
export const getMyGate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ id: z.string().uuid(), brand_id: tenantField }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const sql = neonSql();
    const rows = (await sql`
      select id, updated_at, brand_id, community_id, slug, preset, headline, subheadline, logo_url, mascot_url, background_url
      from cb_gate_configs
      where id = ${data.id} and user_id = ${context.userId} and brand_id = ${data.brand_id}
      limit 1
    `) as GateRow[];
    return rows[0] ? toRecord(rows[0]) : null;
  });

/**
 * Live availability check used while typing a gate address. Slugs are globally
 * unique because gate URLs are global, so this check is deliberately not
 * tenant-scoped — it only ever returns a boolean.
 */
export const checkSlugAvailable = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ slug: slugField, excludeId: z.string().uuid().optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const sql = neonSql();
    const rows = (await (data.excludeId
      ? sql`select id from cb_gate_configs where slug = ${data.slug} and id <> ${data.excludeId} limit 1`
      : sql`select id from cb_gate_configs where slug = ${data.slug} limit 1`)) as GateRow[];
    return { slug: data.slug, available: rows.length === 0 };
  });

export const createGate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => configSchema.parse(data))
  .handler(async ({ context, data }) => {
    const sql = neonSql();
    try {
      const rows = (await sql`
        insert into cb_gate_configs (user_id, brand_id, community_id, slug, preset, headline, subheadline, logo_url, mascot_url, background_url)
        values (${context.userId}, ${data.brand_id}, ${data.community_id ?? data.brand_id}, ${data.slug}, ${data.preset}, ${data.headline}, ${data.subheadline}, ${data.logo_url}, ${data.mascot_url}, ${data.background_url})
        returning id, updated_at, brand_id, community_id, slug, preset, headline, subheadline, logo_url, mascot_url, background_url
      `) as GateRow[];
      return toRecord(rows[0]!);
    } catch (error) {
      throw new Error(isUniqueViolation(error) ? SLUG_TAKEN : (error as Error).message);
    }
  });

export const updateGate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => configSchema.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const sql = neonSql();
    try {
      const rows = (await sql`
        update cb_gate_configs
        set slug = ${data.slug}, preset = ${data.preset}, headline = ${data.headline},
            subheadline = ${data.subheadline}, logo_url = ${data.logo_url},
            mascot_url = ${data.mascot_url}, background_url = ${data.background_url},
            community_id = ${data.community_id ?? data.brand_id}, updated_at = now()
        where id = ${data.id} and user_id = ${context.userId} and brand_id = ${data.brand_id}
        returning id, updated_at, brand_id, community_id, slug, preset, headline, subheadline, logo_url, mascot_url, background_url
      `) as GateRow[];
      if (!rows[0]) throw new Error(WRONG_TENANT);
      return toRecord(rows[0]);
    } catch (error) {
      throw new Error(isUniqueViolation(error) ? SLUG_TAKEN : (error as Error).message);
    }
  });

export const deleteGate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ id: z.string().uuid(), brand_id: tenantField }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const sql = neonSql();
    const rows = (await sql`
      delete from cb_gate_configs
      where id = ${data.id} and user_id = ${context.userId} and brand_id = ${data.brand_id}
      returning id
    `) as GateRow[];
    if (rows.length === 0) throw new Error(WRONG_TENANT);
    return { ok: true };
  });

/** Public read for the shareable gate page — no session required. */
export const getPublicGate = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ slug: z.string().trim().max(60) }).parse(data))
  .handler(async ({ data }) => {
    const sql = neonSql();
    const rows = (await sql`
      select slug, preset, headline, subheadline, logo_url, mascot_url, background_url
      from cb_gate_configs
      where slug = ${data.slug.toLowerCase()}
      limit 1
    `) as GateRow[];
    const row = rows[0];
    if (!row) return null;
    return {
      slug: String(row["slug"]),
      preset: String(row["preset"]),
      headline: String(row["headline"]),
      subheadline: String(row["subheadline"] ?? ""),
      logo_url: (row["logo_url"] as string | null) ?? null,
      mascot_url: (row["mascot_url"] as string | null) ?? null,
      background_url: (row["background_url"] as string | null) ?? null,
    } as GateConfig;
  });
