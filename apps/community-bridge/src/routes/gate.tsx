import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GateForm, SLUG_PATTERN, slugify, useSlugAvailability } from "@/components/gate/gate-form";
import { useAuth } from "@/hooks/use-auth";
import { useBrand } from "@/config/brand-context";
import { createGate } from "@/lib/gate.functions";
import { DEFAULT_GATE, type GateConfig } from "@/lib/gate-presets";
import { isDemoMode } from "@/config/demo-mode";

export const Route = createFileRoute("/gate")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "New Gate — MyFenrir" },
      {
        name: "description",
        content:
          "Create a public MyFenrir sign-in gate in one click: pick a visual preset and publish — no file hosting required.",
      },
      { property: "og:title", content: "New Gate — MyFenrir" },
      {
        property: "og:description",
        content: "Preset-first public gate builder for the MyFenrir portal.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://communities.myfenrir.com/gate" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://communities.myfenrir.com/gate" }],
  }),
  component: NewGatePage,
});

function NewGatePage() {
  const { session, loading, user } = useAuth();
  const navigate = useNavigate();
  const persist = useServerFn(createGate);
  const brand = useBrand();

  const [config, setConfig] = useState<GateConfig>({ slug: "", ...DEFAULT_GATE });
  const [saving, setSaving] = useState(false);
  const slugStatus = useSlugAvailability(config.slug);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login", search: { next: undefined } });
      return;
    }
    setConfig((c) => {
      if (c.slug) return c;
      const fallback = slugify((user?.email ?? "my-gate").split("@")[0] ?? "my-gate");
      return { ...c, slug: fallback.length >= 3 ? fallback : "my-gate" };
    });
  }, [loading, session, user?.email, navigate]);

  const onSave = async () => {
    if (!SLUG_PATTERN.test(config.slug)) {
      toast.error("Pick a gate address of 3–40 lowercase letters, numbers or dashes.");
      return;
    }
    if (slugStatus === "taken") {
      toast.error("That gate address is already taken — pick another one.");
      return;
    }
    if (isDemoMode()) {
      toast.success("Gate published (demo mode — nothing was saved)");
      navigate({ to: "/gates" });
      return;
    }
    setSaving(true);
    try {
      const saved = await persist({
        data: { ...config, brand_id: brand.id, community_id: brand.community.id },
      });
      toast.success("Gate published");
      navigate({ to: "/gates/$id", params: { id: saved.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save gate");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              to="/gates"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> My gates
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Create a gate
            </h1>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              Pick a look. Everything — logo, mascot and atmosphere — is bundled, so your gate is
              ready without uploading or hosting anything.
            </p>
          </div>
          <Button
            variant="fenrir"
            loading={saving}
            disabled={slugStatus === "taken" || slugStatus === "invalid"}
            onClick={onSave}
          >
            <Wand2 className="mr-2 h-4 w-4" />
            Publish gate
          </Button>
        </div>

        <GateForm config={config} onChange={setConfig} slugStatus={slugStatus} />
      </main>
    </div>
  );
}
