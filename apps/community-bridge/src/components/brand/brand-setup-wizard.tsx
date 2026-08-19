/**
 * Guided brand/tenant setup — create a whole new group in one flow.
 *
 * The wizard writes the same `BrandTenantInput` the advanced form does; it just
 * sequences the decisions (identity → look → sign-in → review) and derives sane
 * defaults so a new group is a few keystrokes rather than 20 fields.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BrandAssetUpload } from "@/components/brand/brand-asset-upload";
import { LoginPreview } from "@/components/brand/login-preview";
import { ThemeEditor } from "@/components/brand/theme-editor";
import {
  brandTenantSchema,
  emptyBrandTenant,
  PROVIDER_IDS,
  rowToBrandConfig,
  type BrandTenantInput,
} from "@/config/brand-tenant";
import { GATE_PRESETS } from "@/lib/gate-presets";
import { validateBrandRedirects } from "@/lib/redirect-validation";
import { RedirectPathField } from "@/components/brand/redirect-path-field";
import { DRAFT_BRAND_ID, saveDraftBrand } from "@/config/brand-draft";


const STEPS = ["Identity", "Look & feel", "Sign-in", "Review"] as const;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

interface BrandSetupWizardProps {
  saving: boolean;
  onCancel: () => void;
  onCreate: (draft: BrandTenantInput) => void | Promise<void>;
  /** Hand the half-finished draft to the full form for power users. */
  onAdvanced: (draft: BrandTenantInput) => void;
  existingBrandIds: string[];
}

export function BrandSetupWizard({
  saving,
  onCancel,
  onCreate,
  onAdvanced,
  existingBrandIds,
}: BrandSetupWizardProps) {
  const [step, setStep] = useState(0);
  const [slugTouched, setSlugTouched] = useState(false);
  // Bring-your-own-domain is advanced/optional. Hidden by default so a new room
  // reads as "free Fenrir address, ready now" instead of "buy a domain first".
  const [showCustomDomain, setShowCustomDomain] = useState(false);
  const [draft, setDraft] = useState<BrandTenantInput>(() => emptyBrandTenant());
  const [previewOpened, setPreviewOpened] = useState(false);

  // Once a preview tab exists, keep it in sync with every further draft edit.
  useEffect(() => {
    if (!previewOpened) return;
    const timer = window.setTimeout(() => saveDraftBrand(draft), 250);
    return () => window.clearTimeout(timer);
  }, [draft, previewOpened]);



  const set = <K extends keyof BrandTenantInput>(key: K, value: BrandTenantInput[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function setName(name: string) {
    setDraft((d) => {
      const slug = slugTouched ? d.brand_id : slugify(name);
      return {
        ...d,
        name,
        brand_id: slug,
        community_id: slugTouched ? d.community_id : slug,
        community_label: name || null,
      };
    });
  }

  function applyPreset(presetId: string) {
    const preset = GATE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setDraft((d) => ({
      ...d,
      gate_preset: preset.id,
      theme: { ...d.theme, "--primary": preset.accent },
    }));
  }

  function toggleProvider(id: (typeof PROVIDER_IDS)[number]) {
    setDraft((d) => ({
      ...d,
      providers: (d.providers.includes(id)
        ? d.providers.filter((p) => p !== id)
        : [...d.providers, id]) as BrandTenantInput["providers"],
    }));
  }

  function moveProvider(index: number, delta: number) {
    setDraft((d) => {
      const list = [...d.providers];
      const target = index + delta;
      if (target < 0 || target >= list.length) return d;
      [list[index], list[target]] = [list[target]!, list[index]!];
      return { ...d, providers: list as BrandTenantInput["providers"] };
    });
  }

  const slugTaken = existingBrandIds.includes(draft.brand_id.trim().toLowerCase());

  const stepError = useMemo(() => {
    if (step === 0) {
      if (!draft.name.trim()) return "Give the group a name.";
      if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(draft.brand_id))
        return "Brand id must be 3–40 lowercase letters, numbers or dashes.";
      if (slugTaken) return `“${draft.brand_id}” is already used by another tenant.`;
      if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(draft.community_id))
        return "Community id must be 3–40 lowercase letters, numbers or dashes.";
    }
    if (step === 2 && draft.providers.length === 0) return "Enable at least one sign-in provider.";
    return null;
  }, [step, draft, slugTaken]);

  const previewBrand = useMemo(
    () => rowToBrandConfig({ ...draft, id: "wizard", updated_at: "" }),
    [draft],
  );

  const redirectIssues = useMemo(
    () => validateBrandRedirects(previewBrand).filter((i) => i.field !== "host"),
    [previewBrand],
  );

  /**
   * Stash the unsaved draft and open /login in a new tab reading it, so the
   * exact tenant sign-in screen can be verified before the tenant is created.
   */
  function openDraftLogin() {
    saveDraftBrand(draft);
    setPreviewOpened(true);
    window.open(`/login?brand=${DRAFT_BRAND_ID}`, "_blank", "noopener,noreferrer");
  }

  async function finish() {
    const parsed = brandTenantSchema.safeParse(draft);
    if (!parsed.success) {
      setStep(0);
      return;
    }
    await onCreate(parsed.data);
  }

  return (
    <Card className="mt-8 space-y-8 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">New group setup</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={openDraftLogin}>
            <ExternalLink className="mr-2 h-4 w-4" /> Preview login in new tab
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onAdvanced(draft)}>
            Skip to advanced form
          </Button>
        </div>
      </div>


      <ol className="flex flex-wrap gap-2" aria-label="Setup steps">
        {STEPS.map((label, index) => (
          <li key={label}>
            <Badge variant={index === step ? "default" : "secondary"}>
              {index < step ? <Check className="mr-1 h-3 w-3" /> : null}
              {index + 1}. {label}
            </Badge>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Group / product name">
            <Input
              value={draft.name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Casa Verde"
              autoFocus
            />
          </Field>
          <Field label="Brand id (stable key)">
            <Input
              value={draft.brand_id}
              onChange={(e) => {
                setSlugTouched(true);
                set("brand_id", slugify(e.target.value));
              }}
              placeholder="lore-archive"
            />
          </Field>
          <Field label="Tagline">
            <Input
              value={draft.tagline}
              onChange={(e) => set("tagline", e.target.value)}
              placeholder="Members-only portal for the Casa Verde crew"
            />
          </Field>
          <Field label="Community id (tenant isolation key)">
            <Input
              value={draft.community_id}
              onChange={(e) => set("community_id", slugify(e.target.value))}
            />
          </Field>
          <div className="space-y-3 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
              ✓ Your free Fenrir address — nothing to buy
            </p>
            <p className="text-sm text-foreground">
              Your community goes live on Fenrir the moment you create it — no domain, no DNS.
              Members reach your entrances at{" "}
              <span className="break-all font-mono text-primary">
                communities.myfenrir.com/g/&lt;gate&gt;
              </span>
              .
            </p>
            <button
              type="button"
              onClick={() => setShowCustomDomain((v) => !v)}
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              aria-expanded={showCustomDomain}
            >
              {showCustomDomain
                ? "Hide custom domain"
                : "Advanced: bring your own domain (optional) →"}
            </button>
            {showCustomDomain ? (
              <div className="space-y-2 border-t border-emerald-400/20 pt-3">
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
                  <span className="text-xs text-muted-foreground">
                    Branded subdomain{" "}
                    <span className="font-mono text-foreground/70">&lt;slug&gt;.myfenrir.com</span>
                  </span>
                  <Badge variant="secondary">Coming soon</Badge>
                </div>
                <Field label="Custom domain (optional — requires DNS)">
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
                    placeholder="portal.yourbrand.com"
                  />
                </Field>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Optional. Point your own domain’s DNS to Fenrir to use it instead. Your free
                  Fenrir address keeps working until then — you can add this any time later.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Start from a preset
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {GATE_PRESETS.map((preset) => {
                const active = draft.gate_preset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.id)}
                    aria-pressed={active}
                    className={`rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-primary ring-2 ring-ring/50"
                        : "border-border/60 hover:border-border"
                    }`}
                  >
                    <span
                      className="block h-16 w-full rounded-lg"
                      style={{ background: preset.thumb }}
                      aria-hidden
                    />
                    <span className="mt-2 block text-sm font-medium text-foreground">
                      {preset.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">{preset.tagline}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Colors
            </p>
            <div className="mt-3">
              <ThemeEditor theme={draft.theme} onChange={(theme) => set("theme", theme)} simple />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <BrandAssetUpload
              label="Logo mark (optional — initials otherwise)"
              brandId={draft.brand_id || "new-brand"}
              kind="mark"
              value={draft.logo_url}
              onChange={(v) => set("logo_url", v)}
            />
            <BrandAssetUpload
              label="Wordmark (optional)"
              brandId={draft.brand_id || "new-brand"}
              kind="wordmark"
              value={draft.wordmark_url}
              onChange={(v) => set("wordmark_url", v)}
            />
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-6">
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
                    Add {id}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
                placeholder={`Sign in to continue to ${draft.name || "your group"}`}
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
                placeholder={`Link your ${draft.name || "group"} portal to your Telegram account.`}
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
            <Field label="Post-login path">
              <RedirectPathField
                field="afterLogin"
                value={draft.after_login_path}
                onChange={(v) => set("after_login_path", v)}
              />
            </Field>

          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-5">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Summary label="Name" value={draft.name} />
            <Summary label="Brand id" value={draft.brand_id} />
            <Summary label="Community" value={draft.community_id} />
            <Summary label="Providers" value={draft.providers.join(" → ")} />
            <Summary label="Gate preset" value={draft.gate_preset} />
            <Summary
              label="Address"
              value={
                draft.hostnames.length
                  ? draft.hostnames.join(", ")
                  : "Free Fenrir address (communities.myfenrir.com) — no domain needed"
              }
            />
          </dl>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Live sign-in screen
            </p>
            <LoginPreview brand={previewBrand} />
          </div>

          {redirectIssues.length ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
              <p className="text-sm font-medium text-destructive">Redirect configuration problem</p>
              <ul className="mt-2 space-y-1 text-xs text-destructive/90">
                {redirectIssues.map((issue) => (
                  <li key={issue.field + issue.message}>{issue.message}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Redirects match the allowed sign-in URLs.
            </p>
          )}
        </div>
      ) : null}

      {stepError ? <p className="text-sm text-destructive">{stepError}</p> : null}

      <div className="flex flex-wrap gap-3">
        {step > 0 ? (
          <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <Button disabled={!!stepError} onClick={() => setStep((s) => s + 1)}>
            Continue <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button disabled={saving || !!stepError} onClick={() => void finish()}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Create group
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
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

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-2">
      <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-foreground">{value || "—"}</dd>
    </div>
  );
}
