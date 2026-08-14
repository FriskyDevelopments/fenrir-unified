import { getSiteUrl } from "@/config/site-url";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { GatePreview } from "@/components/gate/gate-preview";
import { useTrackGateView } from "@/hooks/use-track-gate-view";

import { getPublicGate } from "@/lib/gate.functions";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { acceptGateRules, getGateMemberAcceptance } from "@/lib/gate-member-acceptance.functions";
import type { GateMemberAcceptanceState } from "@/components/gate/gate-preview";

export const Route = createFileRoute("/g/$slug")({
  loader: async ({ params }) => {
    const config = await getPublicGate({ data: { slug: params.slug } });
    if (!config) throw notFound();
    return config;
  },
  head: ({ params, loaderData }) => ({
    meta: [
      { title: `${loaderData?.headline ?? "Members only"} — MyFenrir gate` },
      {
        name: "description",
        content:
          loaderData?.subheadline ?? "Sign in with single sign-on to continue to the portal.",
      },
      { property: "og:title", content: loaderData?.headline ?? "MyFenrir gate" },
      {
        property: "og:description",
        content: loaderData?.subheadline ?? "Secure single sign-on gate.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${getSiteUrl()}/g/${params.slug}` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${getSiteUrl()}/g/${params.slug}` }],
  }),
  errorComponent: () => <GateFallback message="This gate could not be loaded." />,
  notFoundComponent: () => <GateFallback message="No gate exists at this address." />,
  component: PublicGatePage,
});

function GateFallback({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Gate unavailable</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <Link to="/" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to MyFenrir
      </Link>
    </div>
  );
}

function PublicGatePage() {
  const config = Route.useLoaderData();
  const params = Route.useParams();
  const { community, loading } = useAuth();
  const getAcceptance = useServerFn(getGateMemberAcceptance);
  const persistAcceptance = useServerFn(acceptGateRules);
  const [acceptance, setAcceptance] = useState<Omit<GateMemberAcceptanceState, "authenticated" | "onAccept"> | null>(null);

  useTrackGateView(params.slug, config.preset);

  useEffect(() => {
    if (loading || !community) return;
    let active = true;
    void getAcceptance({ data: { gateId: config.id } })
      .then((result) => {
        if (active) setAcceptance({ ...result, accepting: false, error: null });
      })
      .catch((error) => {
        if (active) setAcceptance({ accepted: false, rulesUpdated: false, changedRuleKeys: ["arrival", "respect", "privacy", "participation", "ready"], accepting: false, error: error instanceof Error ? error.message : "Could not load rule acceptance" });
      });
    return () => { active = false; };
  }, [loading, community, config.id, getAcceptance]);

  const accept = async () => {
    if (!acceptance) return;
    setAcceptance({ ...acceptance, accepting: true, error: null });
    try {
      await persistAcceptance({ data: { gateId: config.id } });
      setAcceptance({ accepted: true, rulesUpdated: false, changedRuleKeys: [], accepting: false, error: null });
    } catch (error) {
      setAcceptance({ ...acceptance, accepting: false, error: error instanceof Error ? error.message : "Could not record acceptance" });
    }
  };

  const memberAcceptance = community && acceptance
    ? { authenticated: true as const, ...acceptance, onAccept: () => void accept() }
    : undefined;
  return <GatePreview config={config} memberAcceptance={memberAcceptance} />;
}
