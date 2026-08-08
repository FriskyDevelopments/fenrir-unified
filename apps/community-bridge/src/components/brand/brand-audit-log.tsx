import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, History, Loader2, Palette, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listBrandTenantAudit } from "@/lib/brand-tenants.functions";
import {
  AUDIT_ACTION_LABEL,
  auditEntriesToCsv,
  filterThemeEntries,
  isThemeField,
  type BrandAuditEntry,
} from "@/lib/brand-audit";
import type { BrandTenantRow } from "@/config/brand-tenant";
import { useAuth } from "@/hooks/use-auth";

function when(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function Value({ value }: { value: string | null }) {
  if (value === null) {
    return <span className="italic text-muted-foreground">empty</span>;
  }
  if (value === "") {
    return <span className="italic text-muted-foreground">none</span>;
  }
  return <span className="break-all font-mono text-[11px]">{value}</span>;
}

interface BrandAuditLogProps {
  refreshKey: number;
  tenants: BrandTenantRow[];
}

export function BrandAuditLog({ refreshKey, tenants }: BrandAuditLogProps) {
  const fetchAudit = useServerFn(listBrandTenantAudit);
  const { isStaff, roleLoading } = useAuth();
  const [entries, setEntries] = useState<BrandAuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [tenant, setTenant] = useState("");
  const [actor, setActor] = useState("");
  const [field, setField] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [themeOnly, setThemeOnly] = useState(false);

  const filters = useMemo(
    () => ({ tenant, actor, field, from, to }),
    [tenant, actor, field, from, to],
  );

  const load = useCallback(async () => {
    if (!isStaff) return;
    try {
      setError(null);
      const rows = await fetchAudit({ data: filters });
      setEntries(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the audit log");
      setEntries([]);
    }
  }, [fetchAudit, filters, isStaff]);

  const exportCsv = useCallback(async () => {
    if (!isStaff) {
      toast.error("Only staff can export the brand change history.");
      return;
    }
    setExporting(true);
    try {
      // Pull the full matching history, not just the on-screen page.
      // The server fn re-checks staff role, so a non-staff call is refused there too.
      const all = await fetchAudit({ data: { ...filters, limit: 10000 } });
      const rows = themeOnly ? filterThemeEntries(all) : all;
      if (!rows.length) {
        toast.info("Nothing to export for the current filters.");
        return;
      }
      const blob = new Blob([auditEntriesToCsv(rows)], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `brand-${themeOnly ? "theme" : "audit"}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} change entr${rows.length === 1 ? "y" : "ies"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not export the audit log");
    } finally {
      setExporting(false);
    }
  }, [fetchAudit, filters, isStaff, themeOnly]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const visibleEntries = useMemo(
    () => (entries === null ? null : themeOnly ? filterThemeEntries(entries) : entries),
    [entries, themeOnly],
  );

  if (roleLoading) return null;

  if (!isStaff) {
    return (
      <section className="mt-10">
        <Card className="p-4 text-sm text-muted-foreground">
          Only staff can view the brand change history.
        </Card>
      </section>
    );
  }

  const hasFilters = tenant || actor || field || from || to;
  const clearFilters = () => {
    setTenant("");
    setActor("");
    setField("");
    setFrom("");
    setTo("");
  };

  return (
    <section className="mt-10 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <History className="h-4 w-4" /> {themeOnly ? "Theme change history" : "Change history"}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" disabled={exporting} onClick={() => void exportCsv()}>
            {exporting ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-2 h-3.5 w-3.5" />
            )}
            Export CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Tenant
            </span>
            <select
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-card/60 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <option value="">All tenants</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.brand_id}>
                  {t.name} /{t.brand_id}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Actor
            </span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={actor}
                onChange={(e) => setActor(e.target.value)}
                placeholder="email or id"
                className="pl-8"
              />
            </div>
          </label>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Field name
            </span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={field}
                onChange={(e) => setField(e.target.value)}
                placeholder="e.g. theme"
                className="pl-8"
              />
            </div>
          </label>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Date range
            </span>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="px-2 text-sm"
              />
              <span className="text-muted-foreground">→</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="px-2 text-sm"
              />
            </div>
          </label>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" onClick={() => void load()}>
            <Search className="mr-2 h-3.5 w-3.5" /> Apply filters
          </Button>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-2 h-3.5 w-3.5" /> Clear
            </Button>
          ) : null}
          <Button
            variant={themeOnly ? "default" : "ghost"}
            size="sm"
            aria-pressed={themeOnly}
            onClick={() => setThemeOnly((value) => !value)}
          >
            <Palette className="mr-2 h-3.5 w-3.5" /> Theme changes only
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {visibleEntries === null
              ? "Loading…"
              : `${visibleEntries.length} result${visibleEntries.length === 1 ? "" : "s"}`}
          </span>
        </div>
      </Card>

      {error ? <Card className="p-5 text-sm text-destructive">{error}</Card> : null}

      {visibleEntries === null ? (
        <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
        </Card>
      ) : visibleEntries.length === 0 ? (
        <Card className="p-5 text-sm text-muted-foreground">
          {themeOnly
            ? "No theme settings were saved or deleted for the current filters. Theme colors, preset and brand art changes appear here with the tenant and the user who made them."
            : "No tenant changes match the current filters. Every create, edit and delete will show up here with the exact fields that changed."}
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleEntries.map((entry) => (
            <Card key={entry.id} className="space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={entry.action === "deleted" ? "secondary" : "default"}>
                  {AUDIT_ACTION_LABEL[entry.action] ?? entry.action}
                </Badge>
                {entry.changes.some((change) => isThemeField(change.field)) ? (
                  <Badge variant="outline" className="gap-1">
                    <Palette className="h-3 w-3" /> theme
                  </Badge>
                ) : null}
                <p className="text-sm font-medium text-foreground">
                  {entry.tenant_name ?? entry.brand_id}{" "}
                  <span className="text-xs text-muted-foreground">/{entry.brand_id}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {entry.actor_email ?? entry.actor_id ?? "unknown user"} · {when(entry.created_at)}
                </p>
              </div>

              {entry.ip_address || entry.user_agent ? (
                <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                  IP {entry.ip_address ?? "unknown"}
                  {entry.user_agent ? (
                    <>
                      {" · "}
                      <span className="break-all" title={entry.user_agent}>
                        {entry.user_agent}
                      </span>
                    </>
                  ) : null}
                </p>
              ) : null}

              {entry.changes.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="w-40 pb-1 font-medium">Field</th>
                        <th className="pb-1 font-medium">Before</th>
                        <th className="pb-1 font-medium">After</th>
                      </tr>
                    </thead>
                    <tbody className="align-top">
                      {entry.changes.map((change) => (
                        <tr key={change.field} className="border-t border-border/50">
                          <td className="py-1.5 pr-3 font-mono text-[11px] text-foreground">
                            {isThemeField(change.field) ? (
                              <span className="inline-flex items-center gap-1">
                                <Palette className="h-3 w-3 text-primary" />
                                {change.field}
                              </span>
                            ) : (
                              change.field
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-muted-foreground">
                            <Value value={change.before} />
                          </td>
                          <td className="py-1.5 text-foreground">
                            <Value value={change.after} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No field-level changes recorded.</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
