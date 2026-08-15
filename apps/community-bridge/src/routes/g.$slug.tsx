import { getSiteUrl } from "@/config/site-url";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { GatePreview } from "@/components/gate/gate-preview";
import { GateShare } from "@/components/gate/gate-share";
import { useTrackGateView } from "@/hooks/use-track-gate-view";
import { useAuth } from "@/hooks/use-auth";

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
  notFoundComponent: () => (
    <GateFallback message="No Gate is published at this address in the current environment. Open My Gates to recover the canonical link without changing or duplicating your community." />
  ),
  component: PublicGatePage,
});

function GateFallback({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Gate unavailable</h1>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{message}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/gates"
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          Find my canonical Gate
        </Link>
        <Link
          to="/"
          className="rounded-full border border-border px-5 py-2.5 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          Back to MyFenrir
        </Link>
      </div>
    </div>
  );
}

function PublicGatePage() {
  const config = Route.useLoaderData();
  const params = Route.useParams();
  const preset = getPreset(config.preset);
  const { session, loading, roleLoading, telegramId } = useAuth();

  const checkingAccess = loading || roleLoading;
  const telegramReady = Boolean(session && telegramId);
  const telegramCommunity = config.community_id ?? config.brand_id;

  useTrackGateView(params.slug, config.preset);

  return (
    <div className="relative">
      <GatePreview
        config={config}
        actionHref={
          telegramReady
            ? `https://t.me/Myfenrir_bot?start=${encodeURIComponent(telegramCommunity)}`
            : session
              ? "/activate"
              : undefined
        }
        actionLabel={
          checkingAccess
            ? "Checking secure session…"
            : telegramReady
              ? "Continue to Telegram"
              : session
                ? "Link Telegram securely"
                : "Continue securely"
        }
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-5 pb-8">
        <GateShare slug={params.slug} accent={preset.accent} />
      </div>
    </div>
  );
}
