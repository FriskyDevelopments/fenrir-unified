import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Plus, Save, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RequireRole } from "@/components/auth/require-auth";
import { BrandAssetUpload } from "@/components/brand/brand-asset-upload";
import { BrandAuditLog } from "@/components/brand/brand-audit-log";
import { LoginPreview } from "@/components/brand/login-preview";
import { BrandSetupWizard } from "@/components/brand/brand-setup-wizard";
import { ThemeEditor } from "@/components/brand/theme-editor";
import { BrandSyncStatus } from "@/components/brand/brand-sync-status";

import {
  brandConfigToTenant,
  brandTenantSchema,
  emptyBrandTenant,
  PROVIDER_IDS,
  type BrandTenantInput,
  type BrandTenantRow,
} from "@/config/brand-tenant";
import { BRANDS } from "@/config/brands";
import { useBrandRegistry } from "@/config/brand-context";
import { publishBrandUpdate } from "@/config/brand-sync";
import {
  deleteBrandTenant,
  listBrandTenants,
  saveBrandTenant,
} from "@/lib/brand-tenants.functions";
import { GATE_PRESETS } from "@/lib/gate-presets";
import { validateBrandRedirects } from "@/lib/redirect-validation";
import { RedirectPathField } from "@/components/brand/redirect-path-field";

import { rowToBrandConfig } from "@/config/brand-tenant";

const CANONICAL = "https://gate.myfenrir.com/brands";

export const Route = createFileRoute("/brands")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Brand tenants — MyFenrir" },
      {
        name: "description",
        content:
          "Staff-only console for creating white-label brand tenants: theme tokens, sign-in providers, logos and community ids.",
      },
      { property: "og:title", content: "Brand tenants — MyFenrir" },
      {
        property: "og:description",
        content: "Create and edit white-label brand tenants without changing code.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: () => (
    <RequireRole roles={["owner", "admin"]}>
      <BrandTenantsConsole />
    </RequireRole>
  ),
});

type Draft = BrandTenantInput & { id?: string };

function BrandTenantsConsole() {
  const fetchAll = useServerFn(listBrandTenants);
  const persist = useServerFn(saveBrandTenant);
  const remove = useServerFn(deleteBrandTenant);
  const { setBrandId, refreshBrands } = useBrandRegistry();

  const [rows, setRows] = useState<BrandTenantRow[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [wizard, setWizard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [auditKey, setAuditKey] = useState(0);

  const load = useCallback(async () => {
    try {
      setRows(await fetchAll());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load brand tenants");
      setRows([]);
    }
  }, [fetchAll]);

  useEffect(() => {
    void load();
  }, [load]);

  async function persistDraft(candidate: Draft) {
    const parsed = brandTenantSchema.safeParse(candidate);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    setSaving(true);
    try {
      await persist({ data: candidate.id ? { ...parsed.data, id: candidate.id } : parsed.data });
      toast.success(`Saved “${parsed.data.name}”`);
      setDraft(null);
      setWizard(false);
      setAuditKey((k) => k + 1);
      await Promise.all([load(), refreshBrands()]);
      publishBrandUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the tenant");
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!draft) return;
    await persistDraft(draft);
  }

  async function destroy(row: BrandTenantRow) {
    if (!window.confirm(`Delete the “${row.name}” tenant?`)) return;
    try {
      await remove({ data: { id: row.id } });
      toast.success("Tenant deleted");
      setAuditKey((k) => k + 1);
      await Promise.all([load(), refreshBrands()]);
      publishBrandUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the tenant");
    }
  }

  if (!rows) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-6 sm:py-14">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Brand tenants
              </h1>
              <BrandSyncStatus />
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Every brand is configuration: palette tokens, provider order, logos, community id and
              redirects. Nothing here requires a code change.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setDraft(null);
                setWizard(true);
              }}
            >
              <Wand2 className="mr-2 h-4 w-4" /> Guided setup
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setWizard(false);
                setDraft({ ...emptyBrandTenant() });
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> New tenant
            </Button>
          </div>
        </div>

        {wizard ? (
          <BrandSetupWizard
            saving={saving}
            existingBrandIds={rows.map((r) => r.brand_id)}
            onCancel={() => setWizard(false)}
            onCreate={(input) => persistDraft(input)}
            onAdvanced={(input) => {
              setWizard(false);
              setDraft({ ...input });
            }}
          />
        ) : null}

        {draft ? (
          <TenantForm
            draft={draft}
            saving={saving}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSave={save}
          />
        ) : null}

        <section className="mt-10 space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Configured tenants ({rows.length})
          </h2>
          {rows.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">
              No database tenants yet — the app is running on the built-in brand registry below.
            </Card>
          ) : (
            rows.map((row) => {
              const issues = validateBrandRedirects(
                rowToBrandConfig(row),
                typeof window === "undefined" ? null : window.location.origin,
              ).filter((i) => i.field !== "host");
              return (
                <Card key={row.id} className="flex flex-wrap items-center gap-4 p-5">
                  <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-card/60 text-xs font-semibold text-primary">
                    {row.logo_url ? (
                      <img
                        src={row.logo_url}
                        alt={`${row.name} logo`}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      row.name.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-40 flex-1">
                    <p className="font-medium text-foreground">
                      {row.name}{" "}
                      <span className="text-xs text-muted-foreground">/{row.brand_id}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.providers.join(" → ")} · community {row.community_id} ·{" "}
                      {row.hostnames.length ? row.hostnames.join(", ") : "no hostnames"}
                    </p>
                    {issues.length ? (
                      <p className="mt-1 text-xs text-destructive">{issues[0]!.message}</p>
                    ) : null}
                  </div>
                  {row.is_active ? (
                    <Badge>active</Badge>
                  ) : (
                    <Badge variant="secondary">inactive</Badge>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setBrandId(row.brand_id)}>
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDraft({ ...(row as unknown as Draft) })}
                    >
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void destroy(row)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Built-in brands
          </h2>
          <p className="text-sm text-muted-foreground">
            Shipped defaults. Copy one into the database to edit it without a deploy.
          </p>
          <div className="flex flex-wrap gap-2">
            {BRANDS.map((brand) => (
              <Button
                key={brand.id}
                variant="outline"
                size="sm"
                onClick={() => setDraft({ ...brandConfigToTenant(brand) })}
              >
                Copy “{brand.name}”
              </Button>
            ))}
          </div>
        </section>

        <BrandAuditLog refreshKey={auditKey} tenants={rows} />
      </main>
    </div>
  );
}

interface TenantFormProps {
  draft: Draft;
  saving: boolean;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
}

function TenantForm({ draft, saving, onChange, onCancel, onSave }: TenantFormProps) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    onChange({ ...draft, [key]: value });

  function toggleProvider(id: (typeof PROVIDER_IDS)[number]) {
    const list = draft.providers.includes(id)
      ? draft.providers.filter((p) => p !== id)
      : [...draft.providers, id];
    set("providers", list as Draft["providers"]);
  }

  function moveProvider(index: number, delta: number) {
    const list = [...draft.providers];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target]!, list[index]!];
    set("providers", list as Draft["providers"]);
  }

  return (
    <Card className="mt-8 space-y-8 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Brand id (stable key)">
          <Input
            value={draft.brand_id}
            onChange={(e) => set("brand_id", e.target.value)}
            placeholder="casa-verde"
          />
        </Field>
        <Field label="Product name">
          <Input value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Tagline">
          <Input value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} />
        </Field>
        <Field label="Hostnames (comma separated)">
          <Input
            value={draft.hostnames.join(", ")}
            onChange={(e) =>
              set(
                "hostnames",
                e.target.value
                  .split(",")
                  .map((v) => v.trim().toLowerCase())
                  .filter(Boolean),
              )
            }
            placeholder="casaverde.hostcasa.com"
          />
        </Field>
        <Field label="Community id (tenant isolation key)">
          <Input
            value={draft.community_id}
            onChange={(e) => set("community_id", e.target.value)}
            placeholder="casa-verde"
          />
        </Field>
        <Field label="Community label">
          <Input
            value={draft.community_label ?? ""}
            onChange={(e) => set("community_label", e.target.value || null)}
          />
        </Field>
        <Field label="Sign-in headline">
          <Input
            value={draft.login_headline}
            onChange={(e) => set("login_headline", e.target.value)}
            placeholder="Welcome back"
          />
        </Field>
        <Field label="Sign-in subheadline">
          <Input
            value={draft.login_subheadline}
            onChange={(e) => set("login_subheadline", e.target.value)}
            placeholder={`Sign in to continue to ${draft.name || "your brand"}`}
          />
        </Field>
        <Field label="Sign-in button label">
          <Input
            value={draft.login_signin_label}
            onChange={(e) => set("login_signin_label", e.target.value)}
            placeholder="Continue with"
          />
        </Field>
        <Field label="Sign-up link label (blank hides it)">
          <Input
            value={draft.login_signup_label}
            onChange={(e) => set("login_signup_label", e.target.value)}
            placeholder="Create an account"
          />
        </Field>
        <Field label="Forgot password link label (blank hides it)">
          <Input
            value={draft.login_forgot_label}
            onChange={(e) => set("login_forgot_label", e.target.value)}
            placeholder="Trouble signing in?"
          />
        </Field>
        <Field label="Activate screen headline">
          <Input
            value={draft.activate_headline}
            onChange={(e) => set("activate_headline", e.target.value)}
            placeholder="Activate your account"
          />
        </Field>
        <Field label="Activate screen subheadline">
          <Input
            value={draft.activate_subheadline}
            onChange={(e) => set("activate_subheadline", e.target.value)}
            placeholder={`Link your ${draft.name || "brand"} portal to your Telegram account.`}
          />
        </Field>
        <Field label="Activate steps card title">
          <Input
            value={draft.activate_steps_title}
            onChange={(e) => set("activate_steps_title", e.target.value)}
            placeholder="Get your linking code"
          />
        </Field>
        <Field label="Telegram bot button label">
          <Input
            value={draft.activate_bot_label}
            onChange={(e) => set("activate_bot_label", e.target.value)}
            placeholder="Open Telegram bot"
          />
        </Field>
        <Field label="Activate button label">
          <Input
            value={draft.activate_submit_label}
            onChange={(e) => set("activate_submit_label", e.target.value)}
            placeholder="Activate account"
          />
        </Field>
        <Field label="Activation success headline">
          <Input
            value={draft.activate_success_headline}
            onChange={(e) => set("activate_success_headline", e.target.value)}
            placeholder="Account activated"
          />
        </Field>

        <Field label="Terminal command">
          <Input
            value={draft.terminal_command}
            onChange={(e) => set("terminal_command", e.target.value)}
            placeholder="fenrir --login"
          />
        </Field>
        <Field label="Terminal window title">
          <Input
            value={draft.login_terminal_header}
            onChange={(e) => set("login_terminal_header", e.target.value)}
            placeholder="auth_session.sh"
          />
        </Field>
        <Field label="Custom terminal lines (one per line, blank uses defaults)">
          <textarea
            value={draft.login_terminal_lines.join("\n")}
            onChange={(e) =>
              set(
                "login_terminal_lines",
                e.target.value
                  .split("\n")
                  .map((v) => v.trim())
                  .filter(Boolean),
              )
            }
            placeholder={`${draft.terminal_command || "command"}\nestablishing secure channel...\nproviders: ${draft.providers.join(" · ")}\nawaiting identity_`}
            rows={4}
            className="w-full rounded-lg border border-border bg-card/60 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          />
        </Field>
        <Field label="Default gate preset">
          <select
            value={draft.gate_preset}
            onChange={(e) => set("gate_preset", e.target.value)}
            className="h-11 w-full rounded-lg border border-border bg-card/60 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {GATE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <BrandAssetUpload
          label="Logo mark"
          brandId={draft.brand_id}
          kind="mark"
          value={draft.logo_url}
          onChange={(v) => set("logo_url", v)}
        />
        <BrandAssetUpload
          label="Wordmark"
          brandId={draft.brand_id}
          kind="wordmark"
          value={draft.wordmark_url}
          onChange={(v) => set("wordmark_url", v)}
        />
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Sign-in providers (order matters)
        </p>
        <div className="mt-3 space-y-2">
          {draft.providers.map((id, index) => (
            <div key={id} className="flex items-center gap-2">
              <span className="w-24 text-sm capitalize text-foreground">{id}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => moveProvider(index, -1)}
                aria-label={`Move ${id} up`}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => moveProvider(index, 1)}
                aria-label={`Move ${id} down`}
              >
                ↓
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => toggleProvider(id)}>
                Remove
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            {PROVIDER_IDS.filter((id) => !draft.providers.includes(id)).map((id) => (
              <Button
                key={id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => toggleProvider(id)}
              >
                <Plus className="mr-1 h-3 w-3" /> {id}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Theme tokens
        </p>
        <div className="mt-3">
          <ThemeEditor theme={draft.theme} onChange={(theme) => set("theme", theme)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Post-login path">
          <RedirectPathField
            field="afterLogin"
            value={draft.after_login_path}
            onChange={(v) => set("after_login_path", v)}
          />
        </Field>
        <Field label="OAuth return path (public)">
          <RedirectPathField
            field="oauthReturnPath"
            value={draft.oauth_return_path}
            onChange={(v) => set("oauth_return_path", v)}
          />
        </Field>

        <Field label="Marketing site (optional)">
          <Input
            value={draft.site_url ?? ""}
            onChange={(e) => set("site_url", e.target.value || null)}
          />
        </Field>
        <Field label="Terms URL">
          <Input value={draft.terms_url} onChange={(e) => set("terms_url", e.target.value)} />
        </Field>
        <Field label="Privacy URL">
          <Input value={draft.privacy_url} onChange={(e) => set("privacy_url", e.target.value)} />
        </Field>
        <Field label="Status">
          <label className="flex h-11 items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => set("is_active", e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            Active (served to visitors)
          </label>
        </Field>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Live sign-in screen
        </p>
        <LoginPreview
          brand={rowToBrandConfig({ ...draft, id: draft.id ?? "draft", updated_at: "" })}
        />
      </div>

      <RedirectWarnings draft={draft} />

      <div className="flex gap-3">
        <Button onClick={onSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save tenant
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function RedirectWarnings({ draft }: { draft: Draft }) {
  const issues = useMemo(
    () =>
      validateBrandRedirects(
        rowToBrandConfig({ ...draft, id: draft.id ?? "draft", updated_at: "" }),
      ).filter((i) => i.field !== "host"),
    [draft],
  );
  if (issues.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Redirects match the allowed sign-in URLs.</p>
    );
  }
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
      <p className="text-sm font-medium text-destructive">Redirect configuration problem</p>
      <ul className="mt-2 space-y-1 text-xs text-destructive/90">
        {issues.map((issue) => (
          <li key={issue.field + issue.message}>{issue.message}</li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
