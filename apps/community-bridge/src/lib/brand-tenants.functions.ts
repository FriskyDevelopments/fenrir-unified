import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUniqueViolation, neonSql } from "@/lib/neon.server";
import {
  BRAND_TENANT_COLUMNS,
  brandTenantSchema,
  type BrandTenantRow,
} from "@/config/brand-tenant";
import {
  diffTenantFields,
  type AuditFieldChange,
  type BrandAuditEntry,
} from "@/lib/brand-audit";

// Tenants y auditoría en Neon (cb_brand_tenants / cb_brand_tenant_audit).
// Con Neon no hay RLS: el gate de staff se hace EXPLÍCITO aquí, consultando
// los roles que siguen viviendo junto a la identidad (Supabase).
const NOT_STAFF = "Only staff can manage brand tenants.";
const ID_TAKEN = "That brand id is already used by another tenant.";

type AuthedContext = {
  supabase: { from: (table: string) => any };
  userId: string;
  claims: Record<string, unknown>;
};

const TENANT_COL_LIST = BRAND_TENANT_COLUMNS.split(",").map((c) => c.trim());

function toTenantRow(row: Record<string, unknown>): BrandTenantRow {
  const out: Record<string, unknown> = {};
  for (const col of TENANT_COL_LIST) {
    let value = row[col];
    if (value instanceof Date) value = value.toISOString();
    out[col] = value ?? null;
  }
  return out as unknown as BrandTenantRow;
}

/** Client IP + user agent of the current request, best-effort. */
function requestOrigin(): { ip_address: string | null; user_agent: string | null } {
  try {
    const headers = getRequest().headers;
    const forwarded = headers.get("x-forwarded-for");
    const ip =
      headers.get("cf-connecting-ip") ??
      (forwarded ? (forwarded.split(",")[0] ?? "").trim() : null) ??
      headers.get("x-real-ip");
    return {
      ip_address: ip && ip.length ? ip.slice(0, 100) : null,
      user_agent: headers.get("user-agent")?.slice(0, 400) ?? null,
    };
  } catch {
    return { ip_address: null, user_agent: null };
  }
}

/**
 * Staff gate explícito. Los roles viven con la identidad (Supabase
 * `user_roles`); los datos que protegen viven en Neon.
 */
async function assertStaff(context: AuthedContext, message: string = NOT_STAFF): Promise<void> {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(message);
  const roles = ((data ?? []) as Array<{ role: string }>).map((r) => r.role);
  if (!roles.includes("owner") && !roles.includes("admin")) {
    throw new Error(message);
  }
}

/** Best-effort audit write — never blocks or fails the tenant mutation. */
async function recordAudit(
  context: AuthedContext,
  entry: {
    tenant_id: string | null;
    brand_id: string;
    tenant_name: string | null;
    action: "created" | "updated" | "deleted";
    changes: AuditFieldChange[];
  },
): Promise<void> {
  try {
    const email = typeof context.claims["email"] === "string" ? context.claims["email"] : null;
    const origin = requestOrigin();
    const sql = neonSql();
    await sql`
      insert into cb_brand_tenant_audit (tenant_id, brand_id, tenant_name, action, actor_id, actor_email, changes, ip_address, user_agent)
      values (${entry.tenant_id}, ${entry.brand_id}, ${entry.tenant_name}, ${entry.action}, ${context.userId}, ${email}, ${JSON.stringify(entry.changes)}::jsonb, ${origin.ip_address}, ${origin.user_agent})
    `;
  } catch (error) {
    console.error("[brand-audit] failed to record entry", (error as Error).message);
  }
}

/** Active tenants, readable without a session (drives brand resolution). */
export const listPublicBrandTenants = createServerFn({ method: "GET" }).handler(async () => {
  const sql = neonSql();
  const rows = (await sql`
    select * from cb_brand_tenants where is_active = true order by name asc
  `) as Array<Record<string, unknown>>;
  return rows.map(toTenantRow);
});

/** Every tenant, including inactive ones — admin console listing. */
export const listBrandTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as unknown as AuthedContext);
    const sql = neonSql();
    const rows = (await sql`
      select * from cb_brand_tenants order by name asc
    `) as Array<Record<string, unknown>>;
    return rows.map(toTenantRow);
  });

/** Create or replace a tenant, keyed by brand id. Staff-only (gate explícito). */
export const saveBrandTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    brandTenantSchema.extend({ id: z.string().uuid().optional() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context as unknown as AuthedContext);
    const sql = neonSql();
    const { id, ...f } = data;

    try {
      if (id) {
        const previousRows = (await sql`
          select * from cb_brand_tenants where id = ${id} limit 1
        `) as Array<Record<string, unknown>>;
        const previous = previousRows[0] ? toTenantRow(previousRows[0]) : null;

        const rows = (await sql`
          update cb_brand_tenants set
            brand_id = ${f.brand_id}, name = ${f.name}, tagline = ${f.tagline},
            hostnames = ${JSON.stringify(f.hostnames)}::jsonb,
            providers = ${JSON.stringify(f.providers)}::jsonb,
            theme = ${JSON.stringify(f.theme)}::jsonb,
            logo_url = ${f.logo_url}, wordmark_url = ${f.wordmark_url},
            community_id = ${f.community_id}, community_label = ${f.community_label},
            gate_preset = ${f.gate_preset}, terminal_command = ${f.terminal_command},
            login_headline = ${f.login_headline}, login_subheadline = ${f.login_subheadline},
            login_signin_label = ${f.login_signin_label}, login_signup_label = ${f.login_signup_label},
            login_forgot_label = ${f.login_forgot_label}, login_terminal_header = ${f.login_terminal_header},
            login_terminal_lines = ${JSON.stringify(f.login_terminal_lines)}::jsonb,
            activate_headline = ${f.activate_headline}, activate_subheadline = ${f.activate_subheadline},
            activate_steps_title = ${f.activate_steps_title}, activate_bot_label = ${f.activate_bot_label},
            activate_submit_label = ${f.activate_submit_label}, activate_success_headline = ${f.activate_success_headline},
            after_login_path = ${f.after_login_path}, oauth_return_path = ${f.oauth_return_path},
            site_url = ${f.site_url}, terms_url = ${f.terms_url}, privacy_url = ${f.privacy_url},
            survey_sample_pct = ${f.survey_sample_pct},
            is_active = ${f.is_active}, updated_at = now()
          where id = ${id}
          returning *
        `) as Array<Record<string, unknown>>;
        if (!rows[0]) throw new Error(NOT_STAFF);
        const row = toTenantRow(rows[0]);

        const changes = diffTenantFields(
          previous as Record<string, unknown> | null,
          row as unknown as Record<string, unknown>,
        );
        if (changes.length) {
          await recordAudit(context as unknown as AuthedContext, {
            tenant_id: id,
            brand_id: row.brand_id,
            tenant_name: row.name,
            action: "updated",
            changes,
          });
        }
        return row;
      }

      const rows = (await sql`
        insert into cb_brand_tenants (
          brand_id, name, tagline, hostnames, providers, theme, logo_url, wordmark_url,
          community_id, community_label, gate_preset, terminal_command,
          login_headline, login_subheadline, login_signin_label, login_signup_label,
          login_forgot_label, login_terminal_header, login_terminal_lines,
          activate_headline, activate_subheadline, activate_steps_title, activate_bot_label,
          activate_submit_label, activate_success_headline, after_login_path, oauth_return_path,
          site_url, terms_url, privacy_url, survey_sample_pct, is_active, created_by
        ) values (
          ${f.brand_id}, ${f.name}, ${f.tagline},
          ${JSON.stringify(f.hostnames)}::jsonb, ${JSON.stringify(f.providers)}::jsonb, ${JSON.stringify(f.theme)}::jsonb,
          ${f.logo_url}, ${f.wordmark_url},
          ${f.community_id}, ${f.community_label}, ${f.gate_preset}, ${f.terminal_command},
          ${f.login_headline}, ${f.login_subheadline}, ${f.login_signin_label}, ${f.login_signup_label},
          ${f.login_forgot_label}, ${f.login_terminal_header}, ${JSON.stringify(f.login_terminal_lines)}::jsonb,
          ${f.activate_headline}, ${f.activate_subheadline}, ${f.activate_steps_title}, ${f.activate_bot_label},
          ${f.activate_submit_label}, ${f.activate_success_headline}, ${f.after_login_path}, ${f.oauth_return_path},
          ${f.site_url}, ${f.terms_url}, ${f.privacy_url}, ${f.survey_sample_pct}, ${f.is_active}, ${context.userId}
        )
        returning *
      `) as Array<Record<string, unknown>>;
      const row = toTenantRow(rows[0]!);

      await recordAudit(context as unknown as AuthedContext, {
        tenant_id: row.id,
        brand_id: row.brand_id,
        tenant_name: row.name,
        action: "created",
        changes: diffTenantFields(null, row as unknown as Record<string, unknown>),
      });
      return row;
    } catch (error) {
      throw new Error(isUniqueViolation(error) ? ID_TAKEN : (error as Error).message);
    }
  });

export const deleteBrandTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    await assertStaff(context as unknown as AuthedContext);
    const sql = neonSql();
    const previousRows = (await sql`
      select * from cb_brand_tenants where id = ${data.id} limit 1
    `) as Array<Record<string, unknown>>;
    const previous = previousRows[0] ? toTenantRow(previousRows[0]) : null;

    await sql`delete from cb_brand_tenants where id = ${data.id}`;

    if (previous) {
      await recordAudit(context as unknown as AuthedContext, {
        tenant_id: null,
        brand_id: previous.brand_id,
        tenant_name: previous.name,
        action: "deleted",
        changes: diffTenantFields(previous as unknown as Record<string, unknown>, null),
      });
    }
    return { ok: true };
  });

const NOT_STAFF_AUDIT = "Only staff can view the brand change history.";

const auditFiltersSchema = z.object({
  tenant: z.string().trim().max(60).optional(),
  actor: z.string().trim().max(120).optional(),
  field: z.string().trim().max(60).optional(),
  from: z.string().trim().max(30).optional(),
  to: z.string().trim().max(30).optional(),
  limit: z.number().int().min(1).max(10000).optional(),
});

/** Staff-only audit trail, newest first. Optional filters apply server-side. */
export const listBrandTenantAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => auditFiltersSchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertStaff(context as unknown as AuthedContext, NOT_STAFF_AUDIT);
    const sql = neonSql();

    const tenantLike = data.tenant ? `%${data.tenant}%` : null;
    const actorLike = data.actor ? `%${data.actor}%` : null;
    const fieldJson = data.field ? JSON.stringify([{ field: data.field }]) : null;

    let fromIso: string | null = null;
    if (data.from) {
      const fromDate = new Date(data.from);
      if (!Number.isNaN(fromDate.getTime())) fromIso = fromDate.toISOString();
    }
    let toIso: string | null = null;
    if (data.to) {
      const toDate = new Date(data.to);
      if (!Number.isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        toIso = toDate.toISOString();
      }
    }

    const rows = (await sql`
      select id, tenant_id, brand_id, tenant_name, action, actor_id, actor_email, changes, ip_address, user_agent, created_at
      from cb_brand_tenant_audit
      where (${tenantLike}::text is null or brand_id ilike ${tenantLike} or tenant_name ilike ${tenantLike})
        and (${actorLike}::text is null or actor_email ilike ${actorLike} or actor_id::text ilike ${actorLike})
        and (${fieldJson}::jsonb is null or changes @> ${fieldJson}::jsonb)
        and (${fromIso}::timestamptz is null or created_at >= ${fromIso}::timestamptz)
        and (${toIso}::timestamptz is null or created_at <= ${toIso}::timestamptz)
      order by created_at desc
      limit ${data.limit ?? 250}
    `) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      ...row,
      created_at: row["created_at"] instanceof Date ? (row["created_at"] as Date).toISOString() : row["created_at"],
    })) as unknown as BrandAuditEntry[];
  });
