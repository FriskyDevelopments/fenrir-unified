import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { BrandWordmark } from "@/components/brand/brand-logo";
import { useBrand } from "@/config/brand-context";

/**
 * Landing for members the community bot turned away for not meeting the
 * admission requirements staff configured (see admission_requirements).
 * The bot links here with ?missing=username,photo,age so the page can say
 * exactly what to fix.
 */

const MISSING_COPY: Record<string, { title: string; body: string }> = {
  username: {
    title: "A Telegram username",
    body: "Set an @username in Telegram — Settings → Edit profile → Username.",
  },
  photo: {
    title: "A profile photo",
    body: "Add at least one profile photo that is visible to non-contacts.",
  },
  age: {
    title: "A more established account",
    body: "This community requires accounts older than a minimum age. Try again later.",
  },
};

export const Route = createFileRoute("/not-eligible")({
  ssr: false,
  validateSearch: (s: {
    missing?: unknown;
    brand?: unknown;
  }): { missing?: string; brand?: string } => ({
    missing: typeof s.missing === "string" ? s.missing : undefined,
    brand: typeof s.brand === "string" ? s.brand : undefined,
  }),
  head: () => ({
    meta: [{ title: "Not eligible yet" }, { name: "robots", content: "noindex" }],
  }),
  component: NotEligiblePage,
});

function NotEligiblePage() {
  const brand = useBrand();
  const { missing } = Route.useSearch();
  const missingKeys = (missing ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k in MISSING_COPY);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-background px-5 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] opacity-50 blur-3xl"
        style={{
          background:
            "var(--gradient-cosmic, radial-gradient(circle at 50% 0%, oklch(0.45 0.2 25 / 0.5), transparent 70%))",
        }}
      />

      <div className="relative z-10 w-full max-w-md text-center">
        <Link to="/" aria-label={`${brand.name} home`} className="inline-block">
          <BrandWordmark className="mx-auto h-6 w-auto" />
        </Link>

        <div className="mt-8 rounded-2xl border border-border/60 bg-card/40 p-8 backdrop-blur">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10">
            <ShieldAlert className="h-6 w-6 text-destructive" aria-hidden />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
            Sorry — you don't meet the minimum requirements yet
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This community asks every member to meet a few conditions before joining
            {brand.name ? ` ${brand.community.label}` : ""}. If you have doubts, please contact an
            admin — they can tell you exactly what's missing.
          </p>

          {missingKeys.length > 0 && (
            <ul className="mt-6 space-y-3 text-left">
              {missingKeys.map((key) => {
                const item = MISSING_COPY[key]!;
                return (
                  <li key={key} className="rounded-lg border border-border/60 bg-card/60 p-3">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.body}</p>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-7 flex flex-col gap-2">
            {brand.community.url ? (
              <a
                href={brand.community.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Contact an admin
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">
                Reach the staff through the community bot or the channels published on the brand's
                site.
              </p>
            )}
            <Link
              to="/"
              className="inline-flex w-full items-center justify-center rounded-full border border-border bg-card/60 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-ring/40"
            >
              Back to {brand.name}
            </Link>
          </div>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Once you meet the requirements, try joining again — the check is automatic.
        </p>
      </div>
    </main>
  );
}
