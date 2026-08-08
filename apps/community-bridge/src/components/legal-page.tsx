import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BrandWordmark } from "@/components/brand/brand-logo";
import { useBrand } from "@/config/brand-context";

/** Shared chrome for the /terms and /privacy pages. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  const brand = useBrand();
  return (
    <main className="relative min-h-screen bg-background">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-6">
        <Link to="/" aria-label={`${brand.name} home`}>
          <BrandWordmark className="h-6 w-auto" />
        </Link>
        <Link
          to="/login"
          search={{}}
          className="rounded-full border border-border bg-card/60 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-ring/40"
        >
          Sign in
        </Link>
      </header>
      <article className="mx-auto w-full max-w-3xl px-5 pb-20 pt-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {updated}</p>
        <div className="prose-invert mt-8 space-y-6 text-[15px] leading-relaxed text-muted-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground">
          {children}
        </div>
      </article>
    </main>
  );
}
