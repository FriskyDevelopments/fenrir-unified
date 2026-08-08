import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { isDemoMode, setDemoMode } from "@/config/demo-mode";
import { BrandMark, BrandWordmark } from "@/components/brand/brand-logo";

export const Route = createFileRoute("/demo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Demo mode — screen index" },
      {
        name: "description",
        content:
          "Turn on demo mode to browse every screen of the white-label portal — login, activation, dashboard, gates and the brand console — without signing in.",
      },
      { property: "og:title", content: "Demo mode — screen index" },
      {
        property: "og:description",
        content: "Browse every portal screen with a simulated staff session.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DemoPage,
});

const SCREENS: { to: string; label: string; note: string }[] = [
  { to: "/", label: "Landing", note: "Public marketing page and header" },
  { to: "/login", label: "Sign in", note: "SSO buttons, terminal, brand switcher" },
  { to: "/activate", label: "Activate account", note: "Telegram linking code flow" },
  { to: "/dashboard", label: "Dashboard", note: "Account overview after login" },
  { to: "/gates", label: "My gates", note: "Gate gallery with analytics panels" },
  { to: "/gate", label: "New gate", note: "Preset-first gate builder + preview" },
  { to: "/brands", label: "Brand tenants", note: "White-label console, wizard, theme editor" },
  { to: "/admin", label: "Admin", note: "Staff-only tools" },
  {
    to: "/blog/telegram-role-management-guide",
    label: "Guide article",
    note: "Long-form content page",
  },
];

function DemoPage() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(isDemoMode());
  }, []);

  function toggle() {
    const next = !on;
    setDemoMode(next);
    setOn(next);
    // Reload so the auth provider picks the simulated session up everywhere.
    window.location.reload();
  }

  return (
    <div className="min-h-dvh bg-background px-5 py-12">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-ring/30 bg-card/70">
            <BrandMark className="h-full w-full" />
          </span>
          <BrandWordmark className="max-w-[140px]" />
        </div>

        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Demo mode</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Demo mode simulates a signed-in staff session in this browser only, so every
            authenticated screen renders for review. Backend data still requires a real sign-in, so
            lists may appear empty.
          </p>
        </div>

        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm font-medium text-foreground">Demo mode is {on ? "on" : "off"}</p>
            <p className="text-xs text-muted-foreground">
              {on
                ? "Protected screens open without signing in."
                : "Protected screens will redirect to sign in."}
            </p>
          </div>
          <Button type="button" variant={on ? "surface" : "default"} onClick={toggle}>
            {on ? "Turn off demo mode" : "Turn on demo mode"}
          </Button>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          {SCREENS.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="rounded-xl border border-border/60 bg-card/40 p-4 transition-colors hover:border-ring/50 hover:bg-card/70"
            >
              <p className="text-sm font-medium text-foreground">{s.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.note}</p>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground/70">{s.to}</p>
            </Link>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Tip: append <code className="font-mono">?demo</code> to any URL to enable demo mode for
          that visit.
        </p>
      </div>
    </div>
  );
}
