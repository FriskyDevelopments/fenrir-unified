import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Scale, ShieldAlert, ShieldCheck } from "lucide-react";
import { getCommunityStandards, type StandardsRule } from "@/config/community-standards";

export const Route = createFileRoute("/standards")({
  head: () => ({
    meta: [
      { title: "Community Rules & Disclaimer — MyFenrir" },
      {
        name: "description",
        content:
          "The permanent rules, moderation boundaries and operator responsibilities for every MyFenrir Community Gate.",
      },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: StandardsPage,
});

const TONE: Record<
  StandardsRule["tone"],
  { icon: typeof ShieldCheck; className: string; label: string }
> = {
  allow: {
    icon: ShieldCheck,
    className: "border-emerald-400/25 bg-emerald-400/[.04] text-emerald-300",
    label: "Allowed",
  },
  ban: {
    icon: ShieldAlert,
    className: "border-red-400/25 bg-red-400/[.04] text-red-300",
    label: "Prohibited",
  },
  duty: {
    icon: Scale,
    className: "border-amber-400/25 bg-amber-400/[.04] text-amber-300",
    label: "Operator duty",
  },
};

function StandardsPage() {
  const copy = getCommunityStandards();
  return (
    <main className="min-h-dvh bg-[#050807] px-5 py-8 text-foreground sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <Link
          to="/gate"
          className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Gate builder
        </Link>
        <header className="mt-8 grid gap-8 border-b border-border/70 pb-10 lg:grid-cols-[.75fr_1.25fr] lg:items-end">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.28em] text-amber-300">
              Policy / permanent reference
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-[.95] tracking-[-.055em] sm:text-6xl">
              Rules before
              <br />
              <span className="text-foreground/35">the threshold.</span>
            </h1>
          </div>
          <div>
            <p className="text-lg font-medium">{copy.title}</p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {copy.intro}
            </p>
            <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs leading-relaxed text-amber-100/75">
              {copy.legalNote}
            </p>
          </div>
        </header>

        <ol className="mt-8 grid gap-4 lg:grid-cols-2">
          {copy.rules.map((rule, index) => {
            const tone = TONE[rule.tone];
            const Icon = tone.icon;
            return (
              <li
                key={rule.title}
                className={`relative overflow-hidden rounded-2xl border p-5 sm:p-6 ${tone.className}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[9px] uppercase tracking-[.2em] opacity-70">
                    0{index + 1} · {tone.label}
                  </span>
                  <Icon className="h-4 w-4" />
                </div>
                <h2 className="mt-8 text-lg font-semibold tracking-tight text-foreground">
                  {rule.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{rule.body}</p>
              </li>
            );
          })}
        </ol>

        <footer className="mt-8 flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/50 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Operator acknowledgement</p>
            <p className="mt-1 text-xs text-muted-foreground">{copy.acknowledge}</p>
          </div>
          <Link
            to="/gate"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Return to Gate builder
          </Link>
        </footer>
      </div>
    </main>
  );
}
