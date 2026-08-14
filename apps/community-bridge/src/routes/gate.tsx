import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Bot, Check, ExternalLink, Loader2, ShieldCheck, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GateForm, SLUG_PATTERN, slugify, useSlugAvailability } from "@/components/gate/gate-form";
import { CommunityStandardsStep } from "@/components/gate/community-standards-step";
import { OnboardingMotionGuide } from "@/components/gate/onboarding-motion-guide";
import { useAuth } from "@/hooks/use-auth";
import { useBrand } from "@/config/brand-context";
import { getSiteUrl } from "@/config/site-url";
import { createGate } from "@/lib/gate.functions";
import { DEFAULT_GATE, type GateConfig } from "@/lib/gate-presets";
import { isDemoMode } from "@/config/demo-mode";
import { acceptHostStandards, getHostStandardsAcceptance } from "@/lib/gate-onboarding.functions";
import { needsHostStandardsAcceptance } from "@/lib/gate-onboarding";

const TELEGRAM_BOT_USERNAME =
  (import.meta.env["VITE_TELEGRAM_BOT_USERNAME"] as string | undefined) ?? "MyfenrirprotocolDEVbot";
const TELEGRAM_BOT_URL = `https://t.me/${TELEGRAM_BOT_USERNAME}`;

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
      { property: "og:url", content: `${getSiteUrl()}/gate` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "canonical", href: `${getSiteUrl()}/gate` },
    ],
  }),
  component: NewGatePage,
});

function NewGatePage() {
  const { authenticated, loading, user, community } = useAuth();
  const navigate = useNavigate();
  const persist = useServerFn(createGate);
  const fetchStandardsAcceptance = useServerFn(getHostStandardsAcceptance);
  const persistStandardsAcceptance = useServerFn(acceptHostStandards);
  const brand = useBrand();

  const [config, setConfig] = useState<GateConfig>({ slug: "", ...DEFAULT_GATE });
  const [saving, setSaving] = useState(false);
  const [createdGate, setCreatedGate] = useState<{ id: string; slug: string } | null>(null);
  const [showStandards, setShowStandards] = useState<boolean | null>(null);
  const [acceptingStandards, setAcceptingStandards] = useState(false);
  const slugStatus = useSlugAvailability(config.slug);

  useEffect(() => {
    if (loading) return;
    if (!authenticated) {
      navigate({
        to: "/login",
        search: { next: `${window.location.pathname}${window.location.search}` },
      });
      return;
    }
    setConfig((c) => {
      if (c.slug) return c;
      const fallback = slugify((user?.email ?? community?.email ?? "my-gate").split("@")[0] ?? "my-gate");
      return { ...c, slug: fallback.length >= 3 ? fallback : "my-gate" };
    });
  }, [loading, authenticated, user?.email, community?.email, navigate]);

  useEffect(() => {
    if (loading || !authenticated) return;
    if (isDemoMode()) {
      setShowStandards(true);
      return;
    }
    let active = true;
    void fetchStandardsAcceptance()
      .then(({ acceptedVersion }) => {
        if (active) setShowStandards(needsHostStandardsAcceptance(acceptedVersion));
      })
      .catch((error) => {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "Could not check standards acceptance");
        setShowStandards(true);
      });
    return () => { active = false; };
  }, [loading, authenticated, fetchStandardsAcceptance]);

  const onAcceptStandards = async () => {
    if (isDemoMode()) {
      setShowStandards(false);
      return;
    }
    setAcceptingStandards(true);
    try {
      const result = await persistStandardsAcceptance();
      setShowStandards(needsHostStandardsAcceptance(result.acceptedVersion));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record acceptance");
    } finally {
      setAcceptingStandards(false);
    }
  };

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
      setCreatedGate({ id: saved.id, slug: saved.slug });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save gate");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !authenticated || showStandards === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Las normas van ANTES del builder: quien abre una puerta debe saber qué se
  // hace cumplir del otro lado antes de tener una puerta que administrar.
  if (showStandards) {
    return (
      <div className="min-h-dvh bg-background">
        <CommunityStandardsStep onAccept={() => void onAcceptStandards()} accepting={acceptingStandards} />
      </div>
    );
  }

  if (createdGate) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-5">
        <Card className="w-full max-w-2xl p-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Check className="h-5 w-5" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Gate created — finish Telegram setup</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">/{createdGate.slug}</span> is not marked live until Fenrir is linked to its Telegram group and has the permissions you approve.
          </p>
          <div className="mt-6 rounded-xl border border-border bg-card/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Account email</p>
            <p className="mt-1 text-sm text-foreground">{user?.email ?? "Email from your sign-in provider"}</p>
          </div>
          <div className="mt-6 rounded-xl border border-border bg-card/60 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Set up Fenrir in your Telegram group</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connect this Gate to the group it will protect. Telegram requires the group owner to promote the bot; Fenrir cannot grant itself any permission.
                </p>
              </div>
            </div>
            <ol className="mt-5 space-y-4 text-sm text-foreground">
              <li className="flex gap-3"><span className="font-semibold text-primary">1.</span><span>Open <strong>@{TELEGRAM_BOT_USERNAME}</strong>. Its native Mini App links your Telegram identity to this Gate.</span></li>
              <li className="flex gap-3"><span className="font-semibold text-primary">2.</span><span>Add Fenrir to the Telegram group connected to <strong>/{createdGate.slug}</strong>.</span></li>
              <li className="flex gap-3"><span className="font-semibold text-primary">3.</span><span>As the group owner, promote Fenrir to administrator. Enable only the permissions this Gate needs — at minimum <strong>Invite Users</strong>; add moderation permissions only when you enable those rules.</span></li>
              <li className="flex gap-3"><span className="font-semibold text-primary">4.</span><span>Open the Mini App again and test the member journey. Only then is the Gate ready to share.</span></li>
            </ol>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild variant="fenrir">
                <a href={`${TELEGRAM_BOT_URL}?start=gate_${createdGate.slug}`} target="_blank" rel="noreferrer">
                  Open Gate Mini App <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={`${TELEGRAM_BOT_URL}?startgroup=gate_${createdGate.slug}`} target="_blank" rel="noreferrer">
                  Add bot to group <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="ghost"><Link to="/gates"><ShieldCheck className="mr-2 h-4 w-4" />Return to My Gates</Link></Button>
            </div>
          </div>
          <div className="mt-6 rounded-xl border border-primary/30 bg-primary/10 p-5">
            <h2 className="text-base font-semibold text-foreground">Ready to upgrade?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Unlock branded domains, advanced access rules, analytics, and team controls for this gate.
            </p>
            <Button asChild variant="fenrir" className="mt-4">
              <Link to="/upgrade">See upgrade options</Link>
            </Button>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="fenrir">
              <a href={`/g/${createdGate.slug}`} target="_blank" rel="noreferrer">
                View live gate <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button asChild variant="outline"><Link to="/gates/$id" params={{ id: createdGate.id }}>Edit gate</Link></Button>
            <Button asChild variant="ghost"><Link to="/gates">View all gates</Link></Button>
          </div>
        </Card>
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

        <OnboardingMotionGuide />

        <GateForm config={config} onChange={setConfig} slugStatus={slugStatus} />
      </main>
    </div>
  );
}
