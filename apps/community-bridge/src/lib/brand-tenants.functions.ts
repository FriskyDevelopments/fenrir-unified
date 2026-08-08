import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BRAND_TENANT_COLUMNS,
  brandTenantSchema,
  type BrandTenantRow,
} from "@/config/brand-tenant";
import {
  BRAND_AUDIT_COLUMNS,
  diffTenantFields,
  type AuditFieldChange,
  type BrandAuditEntry,
} from "@/lib/brand-audit";

const NOT_STAFF = "Only staff can manage brand tenants.";
const ID_TAKEN = "That brand id is already used by another tenant.";

function mapError(error: { code?: string; message: string }): string {
  if (error.code === "42501" || /row-level security|permission denied/i.test(error.message)) {
    return NOT_STAFF;
  }
  if (error.code === "23505" || /duplicate key|unique/i.test(error.message)) return ID_TAKEN;
  return error.message;
}

type AuthedContext = {
  supabase: { from: (table: string) => any };
  userId: string;
  claims: Record<string, unknown>;
};

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
  const email = typeof context.claims["email"] === "string" ? context.claims["email"] : null;
  const { error } = await context.supabase.from("brand_tenant_audit").insert({
    ...entry,
    ...requestOrigin(),
    actor_id: context.userId,
    actor_email: email,
  });
  if (error) console.error("[brand-audit] failed to record entry", error.message);
}


/** Active tenants, readable without a session (drives brand resolution). */
export const listPublicBrandTenants = createServerFn({ method: "GET" }).handler(async () => {
  const { createPublicClient } = await import("@/lib/supabase-public.server");
  const { data } = await createPublicClient()
    .from("brand_tenants")
    .select(BRAND_TENANT_COLUMNS)
    .eq("is_active", true)
    .order("name", { ascending: true });
  return (data ?? []) as BrandTenantRow[];
});

/** Every tenant, including inactive ones — admin console listing. */
export const listBrandTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("brand_tenants")
      .select(BRAND_TENANT_COLUMNS)
      .order("name", { ascending: true });
    if (error) throw new Error(mapError(error));
    return (data ?? []) as BrandTenantRow[];
  });

/** Create or replace a tenant, keyed by brand id. Staff-only via RLS. */
export const saveBrandTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    brandTenantSchema.extend({ id: z.string().uuid().optional() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const { id, ...fields } = data;

    if (id) {
      const { data: previous } = await context.supabase
        .from("brand_tenants")
        .select(BRAND_TENANT_COLUMNS)
        .eq("id", id)
        .maybeSingle();

      const { data: row, error } = await context.supabase
        .from("brand_tenants")
        .update(fields)
        .eq("id", id)
        .select(BRAND_TENANT_COLUMNS)
        .maybeSingle();
      if (error) throw new Error(mapError(error));
      if (!row) throw new Error(NOT_STAFF);

      const changes = diffTenantFields(
        (previous ?? null) as Record<string, unknown> | null,
        row as Record<string, unknown>,
      );
      if (changes.length) {
        await recordAudit(context as unknown as AuthedContext, {
          tenant_id: id,
          brand_id: (row as BrandTenantRow).brand_id,
          tenant_name: (row as BrandTenantRow).name,
          action: "updated",
          changes,
        });
      }
      return row as BrandTenantRow;
    }

    const { data: row, error } = await context.supabase
      .from("brand_tenants")
      .insert({ ...fields, created_by: context.userId })
      .select(BRAND_TENANT_COLUMNS)
      .single();
    if (error) throw new Error(mapError(error));

    await recordAudit(context as unknown as AuthedContext, {
      tenant_id: (row as BrandTenantRow).id,
      brand_id: (row as BrandTenantRow).brand_id,
      tenant_name: (row as BrandTenantRow).name,
      action: "created",
      changes: diffTenantFields(null, row as Record<string, unknown>),
    });
    return row as BrandTenantRow;
  });

export const deleteBrandTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: previous } = await context.supabase
      .from("brand_tenants")
      .select(BRAND_TENANT_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await context.supabase
      .from("brand_tenants")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(mapError(error));

    if (previous) {
      await recordAudit(context as unknown as AuthedContext, {
        tenant_id: null,
        brand_id: (previous as BrandTenantRow).brand_id,
        tenant_name: (previous as BrandTenantRow).name,
        action: "deleted",
        changes: diffTenantFields(previous as Record<string, unknown>, null),
      });
    }
    return { ok: true };
  });

const NOT_STAFF_AUDIT = "Only staff can view the brand change history.";

/** Explicit staff assertion — belt-and-braces on top of RLS. */
async function assertStaff(context: AuthedContext): Promise<void> {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(NOT_STAFF_AUDIT);
  const roles = ((data ?? []) as Array<{ role: string }>).map((r) => r.role);
  if (!roles.includes("owner") && !roles.includes("admin")) {
    throw new Error(NOT_STAFF_AUDIT);
  }
}

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
  .inputValidator((data) => auditFiltersSchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertStaff(context as unknown as AuthedContext);
    let q = context.supabase
      .from("brand_tenant_audit")
      .select(BRAND_AUDIT_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 250);

    if (data.tenant) {
      q = q.or(
        `brand_id.ilike.%${data.tenant}%,tenant_name.ilike.%${data.tenant}%`,
      );
    }
    if (data.actor) {
      q = q.or(
        `actor_email.ilike.%${data.actor}%,actor_id.ilike.%${data.actor}%`,
      );
    }
    if (data.field) {
      q = q.filter(
        "changes",
        "cs",
        JSON.stringify([{ field: data.field }]),
      );
    }
    if (data.from) {
      const fromDate = new Date(data.from);
      if (!Number.isNaN(fromDate.getTime())) {
        q = q.gte("created_at", fromDate.toISOString());
      }
    }
    if (data.to) {
      const toDate = new Date(data.to);
      if (!Number.isNaN(toDate.getTime())) {
        // Include the full day
        toDate.setHours(23, 59, 59, 999);
        q = q.lte("created_at", toDate.toISOString());
      }
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(mapError(error));
    return (rows ?? []) as unknown as BrandAuditEntry[];
  });


