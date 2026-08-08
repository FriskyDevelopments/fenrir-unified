import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GatePreview } from "@/components/gate/gate-preview";
import { GateAnalyticsPanel } from "@/components/gate/gate-analytics-panel";
import { useAuth } from "@/hooks/use-auth";
import { useBrand } from "@/config/brand-context";
import { listMyGates, type GateRecord } from "@/lib/gate.functions";
import { getMyGateViewStats, type GateViewStats } from "@/lib/gate-analytics.functions";
import { getPreset } from "@/lib/gate-presets";
import { isDemoMode } from "@/config/demo-mode";

export const Route = createFileRoute("/gates/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "My Gates — MyFenrir" },
      {
        name: "description",
        content: "Manage every public MyFenrir sign-in gate you own: edit presets, art and copy.",
      },
      { property: "og:title", content: "My Gates — MyFenrir" },
      { property: "og:description", content: "Manage your public MyFenrir sign-in gates." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://clipsflow-auth-hub.lovable.app/gates" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://clipsflow-auth-hub.lovable.app/gates" }],
  }),
  component: MyGatesPage,
});

function MyGatesPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const fetchGates = useServerFn(listMyGates);
  const fetchStats = useServerFn(getMyGateViewStats);
  const brand = useBrand();
  const [gates, setGates] = useState<GateRecord[] | null>(null);
  const [stats, setStats] = useState<GateViewStats[] | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login", search: { next: undefined } });
      return;
    }
    // Demo mode has a mock session with no bearer token — protected server
    // functions would 401, so show the empty state instead of calling them.
    if (isDemoMode()) {
      setGates([]);
      setStats([]);
      return;
    }
    let active = true;
    fetchGates({ data: { brand_id: brand.id } })
      .then((rows) => active && setGates(rows))
      .catch((error: unknown) => {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "Could not load your gates");
        setGates([]);
      });
    fetchStats({ data: { brand_id: brand.id } })
      .then((rows) => active && setStats(rows))
      .catch(() => active && setStats([]));
    return () => {
      active = false;
    };
  }, [loading, session, fetchGates, fetchStats, navigate, brand.id]);

  if (loading || !gates) {
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
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Public gates
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">My Gates</h1>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              Edit a gate&apos;s preset, copy and custom art at any time. Changes go live instantly.
            </p>
          </div>
          <Button asChild variant="fenrir">
            <Link to="/gate">
              <Plus className="mr-2 h-4 w-4" />
              New gate
            </Link>
          </Button>
        </div>

        {gates.length === 0 ? (
          <Card variant="muted" className="p-10 text-center">
            <h2 className="text-sm font-semibold tracking-tight">No gates yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Create your first gate — one click on a preset and it&apos;s ready to share.
            </p>
            <Button asChild variant="fenrir" className="mt-5">
              <Link to="/gate">Create a gate</Link>
            </Button>
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {gates.map((gate) => (
              <Card key={gate.id} className="overflow-hidden p-0">
                <GatePreview config={gate} compact className="h-44" />
                <div className="space-y-3 p-4">
                  <div>
                    <p className="truncate text-sm font-semibold tracking-tight">{gate.headline}</p>
                    <p className="truncate text-[11px] text-muted-foreground">/g/{gate.slug}</p>
                  </div>
                  <GateAnalyticsPanel
                    stats={stats?.find((s) => s.gate_id === gate.id)}
                    accent={getPreset(gate.preset).accent}
                    loading={stats === null}
                  />

                  <div className="flex items-center gap-2">
                    <Button asChild size="sm" variant="outline" className="flex-1">
                      <Link to="/gates/$id" params={{ id: gate.id }}>
                        Edit
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <a href={`/g/${gate.slug}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span className="sr-only">Open {gate.slug}</span>
                      </a>
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
