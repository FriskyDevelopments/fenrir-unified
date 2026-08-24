import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Compass, Sparkles } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/hooks/use-auth";
import { BrandProvider } from "@/config/brand-context";
import { Toaster } from "@/components/ui/sonner";
import { DemoActivityLog } from "@/components/demo/demo-activity-log";

function NotFoundComponent() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-5 py-10">
      <motion.div aria-hidden="true" className="absolute -left-24 top-10 h-80 w-80 rounded-full bg-primary/20 blur-[100px]" animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.68, 0.3] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div aria-hidden="true" className="absolute -right-28 bottom-0 h-96 w-96 rounded-full bg-violet-500/15 blur-[120px]" animate={{ scale: [1.12, 0.95, 1.12], opacity: [0.24, 0.55, 0.24] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} />
      <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="relative w-full max-w-xl rounded-3xl border border-primary/25 bg-card/75 p-7 text-center shadow-[0_32px_120px_-62px_hsl(var(--primary))] backdrop-blur sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/35 bg-primary/10 text-primary"><Compass className="h-6 w-6" /></div>
        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.25em] text-primary">Fenrir Route Guard</p>
        <h1 className="mt-3 text-6xl font-semibold tracking-[-0.07em] text-foreground sm:text-7xl">404</h1>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">This route does not exist.</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">The address may be incomplete, expired, or moved. No Gate, community, or connected destination was changed.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/gates" className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_14px_28px_-16px_hsl(var(--primary))] transition-transform hover:-translate-y-0.5"><Sparkles className="mr-2 h-4 w-4" /> Your Gates</Link>
          <Link to="/" className="inline-flex items-center justify-center rounded-xl border border-border bg-background/70 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40"><ArrowLeft className="mr-2 h-4 w-4" /> Community home</Link>
        </div>
      </motion.section>
    </main>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MyFenrir" },
      {
        name: "description",
        content: "MyFenrir — secure portal for accounts, roles, and Telegram linking.",
      },
      { name: "theme-color", content: "#070b12" },
      { property: "og:title", content: "MyFenrir" },
      {
        property: "og:description",
        content: "MyFenrir — secure portal for accounts, roles, and Telegram linking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/fenrir-mark.svg?v=myfenrir-2" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("lang");
    const locale = requested && ["en", "es", "fr", "de"].includes(requested)
      ? requested
      : window.localStorage.getItem("myfenrir_locale") || "en";
    window.localStorage.setItem("myfenrir_locale", locale);
    document.documentElement.lang = locale;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrandProvider>
        <AuthProvider>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
          <Toaster />
          <DemoActivityLog />
        </AuthProvider>
      </BrandProvider>
    </QueryClientProvider>
  );
}
