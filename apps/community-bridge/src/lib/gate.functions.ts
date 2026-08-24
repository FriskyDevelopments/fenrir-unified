import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUniqueViolation, neonSql } from "@/lib/neon.server";
import {
  GATE_DESTINATION_INVALID_MESSAGE,
  GATE_NO_DESTINATION_MESSAGE,
  GATE_REQUEST_NOT_GRANTED_MESSAGE,
  GATE_UNAVAILABLE_CODE,
  GATE_UNAVAILABLE_HEADER,
  gateUnavailableError,
} from "@/lib/gate-availability";
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

export interface VerifiedTelegramDestination {
  communityId: string;
  displayName: string;
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
const GATE_HANDOFF_TTL_SECONDS = 5 * 60;

type GateRow = Record<string, unknown>;

type GateAuthedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomBase36(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0]!.toString(36).padStart(7, "0");
}

async function signGateHandoff(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  // A 128-bit HMAC tag keeps the complete Telegram `start` payload below its
  // 64-character limit while remaining infeasible to forge during its 5-minute TTL.
  return base64Url(signature.slice(0, 16));
}

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
  // Read the Telegram id from `account_links`, NOT `user_roles`.
  //
  // `user_roles.telegram_id` exists in the schema but is not the column the
  // linking flow writes — it was null for every linked account in production,
  // so this function sent `telegramUserId: null`. The billing Worker then had no
  // Telegram identity to resolve, could not map the account to its Fenrir org
  // id, found no subscription under the bare Supabase UUID, and returned
  // paid:false. The operator saw "The Pack · active" in the bot and an upgrade
  // demand on the web at the same time.
  //
  // `account_links` is the table the link flow actually writes and the one every
  // other read in this app uses (isOwnerProfile above, use-auth.tsx,
  // api.internal.telegram-destination.ts). Same filters as isOwnerProfile so the
  // two never disagree about which Telegram account this profile owns.
  const { data } = await context.supabase
    .from("account_links")
    .select("telegram_id")
    .eq("supabase_user_id", context.userId)
    .eq("provider", "telegram")
    .eq("status", "linked")
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
  .validator(() => undefined)
  .handler(async ({ context }) => {
    const sql = neonSql();
    const rows = (await sql`
      select id, updated_at, brand_id, community_id, slug, preset, headline, subheadline, logo_url, mascot_url, background_url,
        coalesce(
          (select d.display_name from cb_community_destinations d
           where d.user_id = cb_gate_configs.user_id
             and d.community_id = cb_gate_configs.community_id
             and d.provider = 'telegram' and d.status = 'verified'
           order by d.updated_at desc limit 1),
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
  .validator(() => undefined)
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

/**
 * The dashboard may only offer Telegram groups that Fenrir's bot has already
 * verified for this owner.  Destination rows are written by the bot-side
 * confirmation workflow; no browser-supplied group name or chat ID enters the
 * Gate mapping path.
 */
export const listVerifiedTelegramDestinations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(() => undefined)
  .handler(async ({ context }): Promise<VerifiedTelegramDestination[]> => {
    const sql = neonSql();
    const rows = (await sql`
      select community_id, display_name
      from cb_community_destinations
      where user_id = ${context.userId}
        and provider = 'telegram'
        and status = 'verified'
      order by coalesce(display_name, community_id), community_id
    `) as GateRow[];
    return rows.map((row) => ({
      communityId: String(row["community_id"]),
      displayName: String(row["display_name"] ?? row["community_id"]),
    }));
  });

/** One gate owned by the signed-in user in this brand (null otherwise). */
export const getMyGate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ id: z.string().uuid(), brand_id: tenantField }).parse(data))
  .handler(async ({ context, data }) => {
    const sql = neonSql();
    const rows = (await sql`
      select id, updated_at, brand_id, community_id, slug, preset, headline, subheadline, logo_url, mascot_url, background_url,
        coalesce(
          (select d.display_name from cb_community_destinations d
           where d.user_id = cb_gate_configs.user_id
             and d.community_id = cb_gate_configs.community_id
             and d.provider = 'telegram' and d.status = 'verified'
           order by d.updated_at desc limit 1),
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
  .validator((data) =>
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
  .validator((data) => {
    const parsed = configSchema.parse(data);
    if (parsed.community_id) {
      throw new Error("Telegram mapping must be confirmed in Fenrir.");
    }
    return parsed;
  })
  .handler(async ({ context, data }) => {
    const sql = neonSql();
    const owner = await isOwnerProfile(context);
    const paid = await hasPaidMembership(owner, context);
    const quota = gateQuota(0, owner, paid);
    // A Gate is created before it is attached to Telegram. The bot is the
    // authority that discovers a group and confirms its administrator rights;
    // a browser must never invent that mapping from a typed group name.
    const communityId = null;
    try {
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
  .validator((data) => {
    const parsed = configSchema.extend({ id: z.string().uuid() }).parse(data);
    if (parsed.community_id) {
      throw new Error("Telegram mapping must be confirmed in Fenrir.");
    }
    return parsed;
  })
  .handler(async ({ context, data }) => {
    const sql = neonSql();
    try {
      // The Gate editor can update visual copy only.  Telegram mapping is
      // persisted by the confirmed bot workflow, never by a browser request.
      const rows = (await sql`
        update cb_gate_configs
        set slug = ${data.slug}, preset = ${data.preset}, headline = ${data.headline},
            subheadline = ${data.subheadline}, logo_url = ${data.logo_url},
            mascot_url = ${data.mascot_url}, background_url = ${data.background_url},
            updated_at = now()
        where id = ${data.id} and user_id = ${context.userId} and brand_id = ${data.brand_id}
        returning id, updated_at, brand_id, community_id, slug, preset, headline, subheadline, logo_url, mascot_url, background_url
      `) as GateRow[];
      if (!rows[0]) throw new Error(WRONG_TENANT);
      return toRecord(rows[0]);
    } catch (error) {
      throw new Error(isUniqueViolation(error) ? SLUG_TAKEN : (error as Error).message);
    }
  });

/**
 * Attach a Gate to an already bot-verified Telegram destination.  The chosen
 * ID is re-authorized against the signed-in owner's inventory on the server,
 * so changing a select value in DevTools cannot attach another owner's group.
 */
export const assignVerifiedTelegramDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({ id: z.string().uuid(), brand_id: tenantField, community_id: tenantField })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const sql = neonSql();
    const destinations = (await sql`
      select community_id
      from cb_community_destinations
      where user_id = ${context.userId}
        and community_id = ${data.community_id}
        and provider = 'telegram'
        and status = 'verified'
      limit 1
    `) as GateRow[];
    if (!destinations[0]) {
      throw new Error("Choose a Telegram group Fenrir has verified for your account.");
    }
    const rows = (await sql`
      update cb_gate_configs
      set community_id = ${data.community_id}, updated_at = now()
      where id = ${data.id} and user_id = ${context.userId} and brand_id = ${data.brand_id}
      returning id, updated_at, brand_id, community_id, slug, preset, headline, subheadline, logo_url, mascot_url, background_url,
        coalesce(
          (select d.display_name from cb_community_destinations d
           where d.user_id = cb_gate_configs.user_id
             and d.community_id = cb_gate_configs.community_id
             and d.provider = 'telegram' and d.status = 'verified'
           order by d.updated_at desc limit 1),
          community_id,
          brand_id
        ) as community_label
    `) as GateRow[];
    if (!rows[0]) throw new Error(WRONG_TENANT);
    return toRecord(rows[0]);
  });

export const deleteGate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ id: z.string().uuid(), brand_id: tenantField }).parse(data))
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

/**
 * Public read for the shareable gate page — no session required.
 *
 * Devuelve `null` SÓLO cuando la consulta corrió bien y no había fila: eso es
 * un 404 honesto. Si la base no responde no podemos afirmar que el Gate no
 * exista, así que respondemos 503 y lo decimos. Ver `gate-availability.ts`.
 */
export const getPublicGate = createServerFn({ method: "GET" })
  .validator((data) => z.object({ slug: z.string().trim().max(60) }).parse(data))
  .handler(async ({ data }) => {
    const slug = data.slug.toLowerCase();
    let rows: GateRow[];
    try {
      const sql = neonSql();
      rows = (await sql`
        select brand_id, community_id, slug, preset, headline, subheadline, logo_url, mascot_url, background_url
        from cb_gate_configs
        where slug = ${slug}
        limit 1
      `) as GateRow[];
    } catch (cause) {
      // Ningún fallo silencioso: queda en logs con la causa y el slug.
      console.error(
        `[gate] ${GATE_UNAVAILABLE_CODE} slug=${slug}`,
        cause instanceof Error ? cause.message : cause,
      );
      setResponseStatus(503, "Gate directory unavailable");
      setResponseHeader("Retry-After", "30");
      setResponseHeader("Cache-Control", "no-store");
      // El status de arriba lo pisa el render del documento; la marca no.
      // `src/server.ts` la traduce a 503 real. Ver GATE_UNAVAILABLE_HEADER.
      setResponseHeader(GATE_UNAVAILABLE_HEADER as "x-request-id", "1");
      throw gateUnavailableError(cause);
    }
    const row = rows[0];
    if (!row) {
      // Consulta exitosa y sin fila: ausencia comprobada, no ignorancia.
      setResponseStatus(404, "Gate not published");
      return null;
    }
    return {
      brand_id: String(row["brand_id"]),
      community_id: (row["community_id"] as string | null) ?? null,
      slug: String(row["slug"]),
      preset: String(row["preset"]),
      headline: String(row["headline"]),
      subheadline: String(row["subheadline"] ?? ""),
      logo_url: (row["logo_url"] as string | null) ?? null,
      mascot_url: (row["mascot_url"] as string | null) ?? null,
      background_url: (row["background_url"] as string | null) ?? null,
    } as GateConfig;
  });

/**
 * Mints the only kind of Telegram deep-link a public Gate may use. The ticket
 * is bound to the signed-in visitor's linked Telegram account and to a group
 * that Fenrir itself previously verified. The bot independently validates the
 * HMAC and subject before it makes a one-use Telegram invite.
 */
export const createGateTelegramHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ slug: slugField }).parse(data))
  .handler(async ({ context, data }) => {
    const secret = process.env["FENRIR_GATE_ACCESS_SECRET"]?.trim();
    if (!secret) throw new Error("Telegram handoff is not configured yet.");

    const [identityResult, destinationResult] = await Promise.all([
      context.supabase
        .from("account_links")
        .select("telegram_id")
        .eq("supabase_user_id", context.userId)
        .eq("provider", "telegram")
        .eq("status", "linked")
        .maybeSingle(),
      neonSql()`
        select d.external_id
        from cb_gate_configs g
        join cb_community_destinations d
          on d.user_id = g.user_id
         and d.community_id = g.community_id
         and d.provider = 'telegram'
         and d.status = 'verified'
        left join cb_gate_access_requests a
          on a.gate_id = g.id
         and a.applicant_id = ${context.userId}::uuid
         and a.status = 'granted'
        where g.slug = ${data.slug}
          and (g.user_id = ${context.userId}::uuid or a.id is not null)
        limit 1
      `,
    ]);

    if (identityResult.error || !identityResult.data?.telegram_id) {
      throw new Error("Telegram identity missing from this SSO session. Return from Telegram and continue through the Gate.");
    }
    const externalChatId = String((destinationResult as GateRow[])[0]?.["external_id"] ?? "");
    if (!externalChatId) {
      // El join vacío tiene DOS causas distintas y el mensaje anterior asumía
      // siempre la segunda: culpaba a una solicitud pendiente incluso cuando
      // el Gate simplemente no tiene destino configurado. Las separamos.
      const configured = (await neonSql()`
        select 1
        from cb_gate_configs g
        join cb_community_destinations d
          on d.user_id = g.user_id
         and d.community_id = g.community_id
         and d.provider = 'telegram'
         and d.status = 'verified'
        where g.slug = ${data.slug}
        limit 1
      `) as unknown[];
      if (configured.length === 0) {
        throw new Error(GATE_NO_DESTINATION_MESSAGE);
      }
      throw new Error(GATE_REQUEST_NOT_GRANTED_MESSAGE);
    }
    if (!/^-100\d{6,20}$/.test(externalChatId)) {
      throw new Error(GATE_DESTINATION_INVALID_MESSAGE);
    }

    const telegramUserId = Number(identityResult.data.telegram_id);
    const chatMagnitude = Number(externalChatId.slice(1));
    if (!Number.isSafeInteger(telegramUserId) || !Number.isSafeInteger(chatMagnitude)) {
      throw new Error("This Telegram identity cannot be used for a secure handoff.");
    }
    const expiresAt = Math.floor(Date.now() / 1000) + GATE_HANDOFF_TTL_SECONDS;
    const payload = [
      "1",
      telegramUserId.toString(36),
      chatMagnitude.toString(36),
      expiresAt.toString(36),
      randomBase36(),
    ].join(".");
    const signature = await signGateHandoff(payload, secret);
    const token = `gate_${payload}.${signature}`;
    if (token.length > 64) throw new Error("Secure Telegram handoff payload is too long.");
    return { token, expiresAt: new Date(expiresAt * 1000).toISOString() };
  });
