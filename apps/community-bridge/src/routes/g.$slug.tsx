import { getSiteUrl } from "@/config/site-url";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { GatePreview } from "@/components/gate/gate-preview";
import { GateShare } from "@/components/gate/gate-share";
import { useTrackGateView } from "@/hooks/use-track-gate-view";


import { getPublicGate } from "@/lib/gate.functions";
import { getPreset } from "@/lib/gate-presets";

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
  const preset = getPreset(config.preset);

  useTrackGateView(params.slug, config.preset);


  return (
    <div className="relative">
      <GatePreview config={config} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-5 pb-8">
        <Link
          to="/login"
          /* White-label handoff: the gate's preset carries its tenant to /login. */
          search={{ next: undefined, brand: preset.brandId }}
          className="pointer-events-auto rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white/70 transition hover:text-white"

          style={{ background: `color-mix(in oklab, ${preset.accent} 12%, transparent)` }}
        >
          Sign in
        </Link>
        <GateShare slug={params.slug} accent={preset.accent} />
      </div>
    </div>
  );
}

