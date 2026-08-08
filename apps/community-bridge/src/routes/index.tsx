import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, LayoutDashboard, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { BrandSwitcher } from "@/components/brand/brand-switcher";
import { BrandWordmark } from "@/components/brand/brand-logo";
import { useBrand } from "@/config/brand-context";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "MyFenrir — Telegram Access & Public Gates" },
      {
        name: "description",
        content:
          "MyFenrir links your Telegram community to a secure portal: SSO sign-in, role automation, and one-click public gates with built-in analytics.",
      },
      { property: "og:title", content: "MyFenrir — Telegram Access & Public Gates" },
      {
        property: "og:description",
        content:
          "SSO sign-in, Telegram role automation, and beautiful public gates you can publish in one click.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://gate.myfenrir.com/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://gate.myfenrir.com/" }],
  }),
  component: Index,
});

const features = [
  {
    icon: ShieldCheck,
    title: "SSO-only sign-in",
    body: "Apple, Google, and Microsoft. No passwords to leak, no reset emails to chase.",
  },
  {
    icon: Zap,
    title: "Telegram role automation",
    body: "Link an account once with a short code, then let roles follow your source of truth.",
  },
  {
    icon: Sparkles,
    title: "One-click public gates",
    body: "Preset-first design, live preview, shareable link and QR code with view analytics.",
  },
];

function Index() {
  const { session, loading } = useAuth();
  const brand = useBrand();

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-[520px] opacity-60 blur-3xl"
        style={{
          background:
            "var(--gradient-cosmic, radial-gradient(circle at 50% 0%, oklch(0.45 0.2 25 / 0.5), transparent 70%))",
        }}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6">
        <BrandWordmark className="h-7 w-auto" />
        <nav className="flex items-center gap-2 text-sm">
          <BrandSwitcher className="hidden sm:inline-flex" />
          <Link
            to="/blog/telegram-role-management-guide"
            className="hidden rounded-full px-3 py-2 text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Guide
          </Link>
          {!loading && session ? (
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              search={{}}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Sign in <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </nav>
      </header>

      <section className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-16 pt-10 text-center sm:pt-16">
        {brand.id === "myfenrir" ? (
          <div className="relative mx-auto mb-8 w-full max-w-xl">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 rounded-full opacity-70 blur-3xl"
              style={{
                background:
                  "radial-gradient(circle at 50% 55%, oklch(0.637 0.208 25.3 / 0.35), transparent 70%)",
              }}
            />
            <img
              src="/fenrir-cyber-guardian-hero.svg"
              alt="Fenrir, the guardian of the access gate"
              className="mx-auto w-full max-w-md rounded-3xl border border-white/5 shadow-[0_0_45px_-10px_oklch(0.637_0.208_25.3_/_0.45)] sm:max-w-lg"
              loading="eager"
            />
          </div>
        ) : null}
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Access portal
        </span>
        <h1 className="mt-6 text-balance text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
          Secure access and public gates for your Telegram community
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
          Sign in with the identity you already use, link your Telegram account with a short code,
          and publish a branded gate that looks great before you upload a single file.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {!loading && session ? (
            <Link
              to="/gates"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:w-auto"
            >
              Manage my gates <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <Link
              to="/login"
              search={{}}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:w-auto"
            >
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          )}

          <Link
            to="/blog/telegram-role-management-guide"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card/60 px-6 py-3 font-medium text-foreground transition-colors hover:border-ring/40 sm:w-auto"
          >
            <BookOpen className="h-4 w-4" /> Read the guide
          </Link>
        </div>
      </section>

      <section className="relative z-10 mx-auto grid w-full max-w-5xl gap-4 px-5 pb-20 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <article
            key={title}
            className="rounded-2xl border border-border bg-card/60 p-5 text-left backdrop-blur"
          >
            <Icon className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </article>
        ))}
      </section>

      <footer className="relative z-10 mx-auto w-full max-w-5xl px-5 pb-10 text-center text-xs text-muted-foreground">
        {brand.name} · Signed-in areas like the dashboard, activation, and gate builder require
        sign-in.
      </footer>
    </main>
  );
}
