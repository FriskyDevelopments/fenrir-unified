import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { isDemoMode } from "@/config/demo-mode";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GateForm, SLUG_PATTERN, useSlugAvailability } from "@/components/gate/gate-form";
import { useAuth } from "@/hooks/use-auth";
import { useBrand } from "@/config/brand-context";
import { deleteGate, getMyGate, updateGate } from "@/lib/gate.functions";
import type { GateConfig } from "@/lib/gate-presets";

export const Route = createFileRoute("/gates/$id")({
  ssr: false,
  head: ({ params }) => ({
    meta: [
      { title: "Edit Gate — MyFenrir" },
      {
        name: "description",
        content:
          "Update a MyFenrir gate: switch visual preset, rewrite the copy or swap in your own logo, mascot and background art.",
      },
      { property: "og:title", content: "Edit Gate — MyFenrir" },
      { property: "og:description", content: "Update your public MyFenrir sign-in gate." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `https://clipsflow-auth-hub.lovable.app/gates/${params.id}` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
    links: [
      { rel: "canonical", href: `https://clipsflow-auth-hub.lovable.app/gates/${params.id}` },
    ],
  }),
  component: EditGatePage,
});

function EditGatePage() {
  const { id } = Route.useParams();
  const { session, loading } = useAuth();
  const brand = useBrand();
  const navigate = useNavigate();
  const fetchGate = useServerFn(getMyGate);
  const persist = useServerFn(updateGate);
  const remove = useServerFn(deleteGate);

  const [config, setConfig] = useState<GateConfig | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const slugStatus = useSlugAvailability(config?.slug ?? "", id);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login", search: { next: undefined } });
      return;
    }
    // Demo mode has no real bearer token; skip the protected fetch.
    if (isDemoMode()) {
      setMissing(true);
      return;
    }
    let active = true;
    fetchGate({ data: { id, brand_id: brand.id } })
      .then((row) => {
        if (!active) return;
        if (!row) {
          setMissing(true);
          return;
        }
        const {
          id: _id,
          updated_at: _updatedAt,
          brand_id: _brandId,
          community_id: _communityId,
          ...rest
        } = row;
        setConfig(rest);
      })
      .catch((error: unknown) => {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "Could not load gate");
        setMissing(true);
      });
    return () => {
      active = false;
    };
  }, [loading, session, id, fetchGate, navigate, brand.id]);

  const onSave = async () => {
    if (!config) return;
    if (!SLUG_PATTERN.test(config.slug)) {
      toast.error("Pick a gate address of 3–40 lowercase letters, numbers or dashes.");
      return;
    }
    if (slugStatus === "taken") {
      toast.error("That gate address is already taken — pick another one.");
      return;
    }
    setSaving(true);
    try {
      const saved = await persist({
        data: { ...config, id, brand_id: brand.id, community_id: brand.community.id },
      });
      const { id: _id, updated_at: _updatedAt, ...rest } = saved;
      setConfig(rest);
      toast.success("Gate updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update gate");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    setDeleting(true);
    try {
      await remove({ data: { id, brand_id: brand.id } });
      toast.success("Gate deleted");
      navigate({ to: "/gates" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete gate");
    } finally {
      setDeleting(false);
    }
  };

  if (missing) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-6">
        <Card variant="muted" className="max-w-sm p-8 text-center">
          <h1 className="text-sm font-semibold tracking-tight">Gate not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This gate doesn&apos;t exist or isn&apos;t yours to edit.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link to="/gates">Back to my gates</Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (loading || !config) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <main id="main" className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              to="/gates"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> My gates
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Edit gate</h1>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              Change the preset, copy or your own art. Saving publishes immediately.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" loading={deleting} onClick={onDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
            <Button
              variant="fenrir"
              loading={saving}
              disabled={slugStatus === "taken" || slugStatus === "invalid"}
              onClick={onSave}
            >
              <Save className="mr-2 h-4 w-4" />
              Save changes
            </Button>
          </div>
        </div>

        <GateForm config={config} onChange={(next) => setConfig(next)} slugStatus={slugStatus} />
      </main>
    </div>
  );
}
