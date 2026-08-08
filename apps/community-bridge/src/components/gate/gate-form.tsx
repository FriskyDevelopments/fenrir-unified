import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, ExternalLink } from "lucide-react";
import { isDemoMode } from "@/config/demo-mode";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { GatePreview } from "@/components/gate/gate-preview";
import { checkSlugAvailable } from "@/lib/gate.functions";
import { GateMediaField } from "@/components/gate/gate-media-field";
import { GATE_PRESETS, type GateConfig } from "@/lib/gate-presets";
import { cn } from "@/lib/utils";

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export type SlugStatus = "idle" | "invalid" | "checking" | "available" | "taken";

/** Debounced uniqueness check for a gate address. */
export function useSlugAvailability(slug: string, excludeId?: string) {
  const check = useServerFn(checkSlugAvailable);
  const [status, setStatus] = useState<SlugStatus>("idle");

  useEffect(() => {
    if (!slug) {
      setStatus("idle");
      return;
    }
    if (!SLUG_PATTERN.test(slug)) {
      setStatus("invalid");
      return;
    }
    // Demo mode has no real session, so the protected check would 401.
    if (isDemoMode()) {
      setStatus("available");
      return;
    }
    setStatus("checking");
    let active = true;
    const timer = setTimeout(() => {
      check({ data: excludeId ? { slug, excludeId } : { slug } })
        .then((result) => {
          if (active) setStatus(result.available ? "available" : "taken");
        })
        .catch(() => active && setStatus("idle"));
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [slug, excludeId, check]);

  return status;
}

const SLUG_MESSAGE: Record<SlugStatus, string> = {
  idle: "3–40 lowercase letters, numbers or dashes",
  invalid: "Use 3–40 lowercase letters, numbers or dashes.",
  checking: "Checking availability…",
  available: "This address is available.",
  taken: "That gate address is already taken — pick another one.",
};

interface GateFormProps {
  config: GateConfig;
  onChange: (config: GateConfig) => void;
  slugStatus: SlugStatus;
}

export function GateForm({ config, onChange, slugStatus }: GateFormProps) {
  const [advancedOpen, setAdvancedOpen] = useState(
    Boolean(config.logo_url || config.mascot_url || config.background_url),
  );

  const gateUrl = useMemo(
    () =>
      typeof window !== "undefined" && SLUG_PATTERN.test(config.slug)
        ? `${window.location.origin}/g/${config.slug}`
        : "",
    [config.slug],
  );

  const set = <K extends keyof GateConfig>(key: K, value: GateConfig[K]) =>
    onChange({ ...config, [key]: value });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <Card className="p-5 sm:p-6">
          <h2 className="text-sm font-semibold tracking-tight">1. Choose a preset</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            One click sets the logo, mascot and background together. Pick any of the{" "}
            {GATE_PRESETS.length} looks.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {GATE_PRESETS.map((preset) => {
              const active = config.preset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => set("preset", preset.id)}
                  aria-pressed={active}
                  className={cn(
                    "group relative overflow-hidden rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                    active ? "border-ring/70 shadow-glow" : "border-border hover:border-ring/40",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="block h-20 w-full rounded-lg"
                    style={{ background: preset.thumb }}
                  />
                  <span className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground">{preset.name}</span>
                    {active ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                  </span>
                  <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                    {preset.tagline}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="text-sm font-semibold tracking-tight">2. Words &amp; address</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="gate-slug">Gate address</Label>
              <Input
                id="gate-slug"
                value={config.slug}
                onChange={(e) => set("slug", slugify(e.target.value))}
                placeholder="my-gate"
                aria-invalid={slugStatus === "invalid" || slugStatus === "taken"}
                aria-describedby="gate-slug-status"
              />
              <p
                id="gate-slug-status"
                aria-live="polite"
                className={cn(
                  "text-[11px]",
                  slugStatus === "taken" || slugStatus === "invalid"
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {slugStatus === "available" && gateUrl
                  ? `${gateUrl} is available.`
                  : SLUG_MESSAGE[slugStatus]}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gate-headline">Headline</Label>
              <Input
                id="gate-headline"
                value={config.headline}
                onChange={(e) => set("headline", e.target.value)}
                maxLength={80}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="gate-sub">Subheadline</Label>
              <Input
                id="gate-sub"
                value={config.subheadline}
                onChange={(e) => set("subheadline", e.target.value)}
                maxLength={160}
              />
            </div>
          </div>
        </Card>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <Card variant="muted" className="p-5 sm:p-6">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span>
                  <span className="block text-sm font-semibold tracking-tight">
                    Your own art — images, GIF or video
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Optional. Presets already work; swap in brand files any time.
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    advancedOpen && "rotate-180",
                  )}
                />
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent className="mt-5 space-y-4">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Upload straight from your device — images, animated GIFs and short MP4 / WEBM loops
                all work. Already hosted somewhere? Paste the public <code>https://</code> link
                instead.
              </p>
              {(
                [
                  ["logo_url", "Logo mark", "Shown at the top. Wide artwork works best."],
                  ["mascot_url", "Mascot / product visual", "A GIF or MP4 loop makes it move."],
                  ["background_url", "Background", "Full-bleed image or video; auto-dimmed."],
                ] as const
              ).map(([key, label, hint]) => (
                <GateMediaField
                  key={key}
                  id={key}
                  label={label}
                  hint={hint}
                  value={config[key]}
                  onChange={(value) => set(key, value)}
                />
              ))}
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>

      <div className="space-y-3 lg:sticky lg:top-10 lg:self-start">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Live preview
          </p>
          {gateUrl ? (
            <a
              href={`/g/${config.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Open gate <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
        <GatePreview config={config} compact className="border border-border" />
      </div>
    </div>
  );
}
