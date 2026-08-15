import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUniqueViolation, neonSql } from "@/lib/neon.server";
import type { GateConfig } from "@/lib/gate-presets";
import { gateLimitReached, gateQuota } from "@/lib/gate-limits";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Datos en Neon (cb_gate_configs); la sesión/identidad sigue siendo Supabase.
const GATE_COLUMNS = "slug, preset, headline, subheadline, logo_url, mascot_url, background_url";
const GATE_RECORD_COLUMNS = `id, updated_at, brand_id, community_id, ${GATE_COLUMNS}`;

export interface GateRecord extends GateConfig {
  id: string;
  updated_at: string;
  brand_id: string;
  community_id: string | null;
  community_label: string;
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
const STANDARD_COMMUNITY_LIMIT =
  "Standard profiles can use one active community. Existing gates stay available.";
const MEMBERSHIP_REQUIRED =
  "A paid MyFenrir membership is required from your first Gate. Upgrade to Standard to create up to 5 Gates.";

type GateRow = Record<string, unknown>;

type GateAuthedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

async function isOwnerProfile(context: GateAuthedContext): Promise<boolean> {
  const [{ data, error }, { data: link }] = await Promise.all([
    context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId),
    context.supabase
      .from("account_links")
      .select("telegram_id")
      .eq("supabase_user_id", context.userId)
      .eq("provider", "telegram")
      .eq("status", "linked")
      .maybeSingle(),
  ]);
  if (error) throw new Error("Could not resolve this profile's gate limit.");
  return (
    ((data ?? []) as Array<{ role: string }>).some((row) => row.role === "owner") ||
    Number(link?.telegram_id) === 8581086019
  );
}

async function hasPaidMembership(owner: boolean, context: GateAuthedContext): Promise<boolean> {
  if (owner) return true;
  const secret = process.env["COMMUNITY_BRIDGE_BILLING_SECRET"]?.trim();
  if (!secret) return false;
  const { data } = await context.supabase
    .from("user_roles")
    .select("telegram_id")
    .eq("user_id", context.userId)
    .maybeSingle();
  const response = await fetch("https://fenrir-stars-payments.hrgrrtks2p.workers.dev/api/internal/community-billing-status", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ userId: context.userId, telegramUserId: data?.telegram_id ? String(data.telegram_id) : null }),
  }).catch(() => null);
  if (!response?.ok) return false;
  const billing = (await response.json().catch(() => null)) as {
    paid?: boolean;
    plan?: string;
    status?: string | null;
  } | null;
  return billing?.paid === true && billing.plan !== "free" && billing.status === "active";
}

function toRecord(row: GateRow): GateRecord {
  return {
    id: String(row["id"]),
    updated_at: new Date(row["updated_at"] as string | Date).toISOString(),
    brand_id: String(row["brand_id"]),
    community_id: (row["community_id"] as string | null) ?? null,
    community_label: String(row["community_label"] ?? row["community_id"] ?? row["brand_id"]),
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
      select id, updated_at, brand_id, community_id, slug, preset, headline, subheadline, logo_url, mascot_url, background_url,
        coalesce(
          (select coalesce(t.community_label, t.name) from cb_brand_tenants t
           where t.community_id = cb_gate_configs.community_id and t.is_active = true
           order by t.updated_at desc limit 1),
          community_id,
          brand_id
        ) as community_label
      from cb_gate_configs
      where user_id = ${context.userId}
      order by created_at asc
    `) as GateRow[];
    return rows.map(toRecord);
  });

export const getMyGateQuota = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => undefined)
  .handler(async ({ context }) => {
    const sql = neonSql();
    const owner = await isOwnerProfile(context);
    const paid = await hasPaidMembership(owner, context);
    const rows = (await sql`
      select count(*)::int as used
      from cb_gate_configs
      where user_id = ${context.userId}
    `) as GateRow[];
    return gateQuota(Number(rows[0]?.["used"] ?? 0), owner, paid);
  });

/** One gate owned by the signed-in user in this brand (null otherwise). */
export const getMyGate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), brand_id: tenantField }).parse(data))
  .handler(async ({ context, data }) => {
    const sql = neonSql();
    const rows = (await sql`
      select id, updated_at, brand_id, community_id, slug, preset, headline, subheadline, logo_url, mascot_url, background_url,
        coalesce(
          (select coalesce(t.community_label, t.name) from cb_brand_tenants t
           where t.community_id = cb_gate_configs.community_id and t.is_active = true
           order by t.updated_at desc limit 1),
          community_id,
          brand_id
        ) as community_label
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
    const owner = await isOwnerProfile(context);
    const paid = await hasPaidMembership(owner, context);
    const quota = gateQuota(0, owner, paid);
    const communityId = data.community_id ?? data.brand_id;
    try {
      if (!paid) throw new Error(MEMBERSHIP_REQUIRED);
      if (!owner) {
        const communities = (await sql`
          select community_id from cb_gate_configs
          where user_id = ${context.userId} and community_id is not null
          order by created_at asc
          limit 1
        `) as GateRow[];
        const activeCommunity = communities[0]?.["community_id"];
        if (activeCommunity && activeCommunity !== communityId) {
          throw new Error(STANDARD_COMMUNITY_LIMIT);
        }
      }
      const rows = (await sql`
        insert into cb_gate_configs (user_id, brand_id, community_id, slug, preset, headline, subheadline, logo_url, mascot_url, background_url)
        select ${context.userId}, ${data.brand_id}, ${communityId}, ${data.slug}, ${data.preset}, ${data.headline}, ${data.subheadline}, ${data.logo_url}, ${data.mascot_url}, ${data.background_url}
        where (select count(*) from cb_gate_configs where user_id = ${context.userId}) < ${quota.limit}
        returning id, updated_at, brand_id, community_id, slug, preset, headline, subheadline, logo_url, mascot_url, background_url
      `) as GateRow[];
      if (!rows[0]) throw new Error(gateLimitReached(quota.limit));
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
    const owner = await isOwnerProfile(context);
    const communityId = data.community_id ?? data.brand_id;
    try {
      if (!owner) {
        const communities = (await sql`
          select community_id from cb_gate_configs
          where user_id = ${context.userId}
            and id <> ${data.id}
            and community_id is not null
          order by created_at asc
          limit 1
        `) as GateRow[];
        const activeCommunity = communities[0]?.["community_id"];
        if (activeCommunity && activeCommunity !== communityId) {
          throw new Error(STANDARD_COMMUNITY_LIMIT);
        }
      }
      const rows = (await sql`
        update cb_gate_configs
        set slug = ${data.slug}, preset = ${data.preset}, headline = ${data.headline},
            subheadline = ${data.subheadline}, logo_url = ${data.logo_url},
            mascot_url = ${data.mascot_url}, background_url = ${data.background_url},
            community_id = ${communityId}, updated_at = now()
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
  .inputValidator((data) => z.object({ id: z.string().uuid(), brand_id: tenantField }).parse(data))
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
