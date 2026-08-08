import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { GateConfig } from "@/lib/gate-presets";

const GATE_COLUMNS = "slug, preset, headline, subheadline, logo_url, mascot_url, background_url";
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

function isSlugCollision(error: { code?: string; message: string }) {
  return error.code === "23505" || /duplicate key|unique/i.test(error.message);
}

/** Every gate owned by the signed-in user *within the current brand*. */
export const listMyGates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ brand_id: tenantField }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("gate_configs")
      .select(GATE_RECORD_COLUMNS)
      .eq("user_id", context.userId)
      .eq("brand_id", data.brand_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as GateRecord[];
  });

/** One gate owned by the signed-in user in this brand (null otherwise). */
export const getMyGate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), brand_id: tenantField }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("gate_configs")
      .select(GATE_RECORD_COLUMNS)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("brand_id", data.brand_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as GateRecord | null;
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
  .handler(async ({ context, data }) => {
    let query = context.supabase.from("gate_configs").select("id").eq("slug", data.slug).limit(1);
    if (data.excludeId) query = query.neq("id", data.excludeId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { slug: data.slug, available: (rows ?? []).length === 0 };
  });

export const createGate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => configSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("gate_configs")
      .insert({
        ...data,
        community_id: data.community_id ?? data.brand_id,
        user_id: context.userId,
      })
      .select(GATE_RECORD_COLUMNS)
      .single();
    if (error) throw new Error(isSlugCollision(error) ? SLUG_TAKEN : error.message);
    return row as GateRecord;
  });

export const updateGate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => configSchema.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { id, ...fields } = data;
    const { data: row, error } = await context.supabase
      .from("gate_configs")
      .update({ ...fields, community_id: fields.community_id ?? fields.brand_id })
      .eq("id", id)
      .eq("user_id", context.userId)
      .eq("brand_id", fields.brand_id)
      .select(GATE_RECORD_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(isSlugCollision(error) ? SLUG_TAKEN : error.message);
    if (!row) throw new Error(WRONG_TENANT);
    return row as GateRecord;
  });

export const deleteGate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), brand_id: tenantField }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("gate_configs")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("brand_id", data.brand_id)
      .select("id");
    if (error) throw new Error(error.message);
    if ((rows ?? []).length === 0) throw new Error(WRONG_TENANT);
    return { ok: true };
  });

/** Public read for the shareable gate page — no session required. */
export const getPublicGate = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ slug: z.string().trim().max(60) }).parse(data))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
            headers.delete("Authorization");
          }
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });
    const { data: row } = await client
      .from("gate_configs")
      .select(GATE_COLUMNS)
      .eq("slug", data.slug.toLowerCase())
      .maybeSingle();
    return (row ?? null) as GateConfig | null;
  });
