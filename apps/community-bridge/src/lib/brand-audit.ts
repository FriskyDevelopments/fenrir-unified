/**
 * Shared types + diffing for the brand tenant audit log.
 * Client-safe: imported by both the admin UI and the server functions.
 */

export interface AuditFieldChange {
  field: string;
  before: string | null;
  after: string | null;
}

export interface BrandAuditEntry {
  id: string;
  tenant_id: string | null;
  brand_id: string;
  tenant_name: string | null;
  action: "created" | "updated" | "deleted" | string;
  actor_id: string | null;
  actor_email: string | null;
  changes: AuditFieldChange[];
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export const BRAND_AUDIT_COLUMNS =
  "id, tenant_id, brand_id, tenant_name, action, actor_id, actor_email, changes, ip_address, user_agent, created_at";

/** Human-readable, comparable rendering of any tenant field value. */
export function formatAuditValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.length ? value.join(", ") : "";
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return entries.map(([k, v]) => `${k}: ${String(v)}`).join("; ");
  }
  return String(value);
}

const IGNORED_FIELDS = new Set(["id", "created_at", "updated_at", "created_by"]);

/** Field-level before/after diff between two tenant records. */
export function diffTenantFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): AuditFieldChange[] {
  const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: AuditFieldChange[] = [];
  for (const field of [...fields].sort()) {
    if (IGNORED_FIELDS.has(field)) continue;
    const from = formatAuditValue(before?.[field]);
    const to = formatAuditValue(after?.[field]);
    if (from === to) continue;
    changes.push({ field, before: from, after: to });
  }
  return changes;
}

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  created: "created",
  updated: "updated",
  deleted: "deleted",
};

const CSV_HEADERS = [
  "timestamp",
  "action",
  "brand_id",
  "tenant_name",
  "tenant_id",
  "actor_email",
  "actor_id",
  "ip_address",
  "user_agent",
  "field",
  "before",
  "after",
] as const;

function csvCell(value: string | null | undefined): string {
  const text = value ?? "";
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One CSV row per field change (or a single row when nothing changed). */
export function auditEntriesToCsv(entries: BrandAuditEntry[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const entry of entries) {
    const base = [
      entry.created_at,
      entry.action,
      entry.brand_id,
      entry.tenant_name,
      entry.tenant_id,
      entry.actor_email,
      entry.actor_id,
      entry.ip_address,
      entry.user_agent,
    ];
    const changes = entry.changes.length
      ? entry.changes
      : [{ field: "", before: null, after: null }];
    for (const change of changes) {
      lines.push(
        [...base, change.field, change.before, change.after].map(csvCell).join(","),
      );
    }
  }
  // BOM keeps Excel happy with UTF-8 values.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** Fields that make up a tenant's visual theme (colors, preset, brand art). */
export const THEME_FIELDS = new Set([
  "theme",
  "gate_preset",
  "logo_url",
  "wordmark_url",
]);

/** True when this change touches the tenant's theme settings. */
export function isThemeField(field: string): boolean {
  return THEME_FIELDS.has(field);
}

/**
 * Narrow a list of audit entries to theme activity only: entries whose changes
 * touch theme fields, with non-theme field rows stripped out. Deletions keep
 * their theme snapshot so admins can see what was removed.
 */
export function filterThemeEntries(entries: BrandAuditEntry[]): BrandAuditEntry[] {
  const result: BrandAuditEntry[] = [];
  for (const entry of entries) {
    const changes = entry.changes.filter((change) => isThemeField(change.field));
    if (!changes.length) continue;
    result.push({ ...entry, changes });
  }
  return result;
}
