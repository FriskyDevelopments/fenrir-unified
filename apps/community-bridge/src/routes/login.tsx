import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatAuthError } from "@/lib/auth-errors";
import { useBrand } from "@/config/brand-context";
import { validateBrandRedirects, type RedirectIssue } from "@/lib/redirect-validation";
import { BRANDS, brandLoginCopy, getBrand, type ProviderId } from "@/config/brands";
import { isDemoMode } from "@/config/demo-mode";
import { logDemoEvent } from "@/config/demo-log";
import { getSiteUrl } from "@/config/site-url";

/** Build-time brand: head() is static, so it uses the deployment's brand. */
const HEAD_BRAND = getBrand(import.meta.env["VITE_BRAND_ID"]);

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (s: {
    next?: unknown;
    brand?: unknown;
    sso?: unknown;
  }): {
    next?: string;
    brand?: string;
    sso?: string;
  } => ({
    next: typeof s.next === "string" ? s.next : undefined,
    brand:
      typeof s.brand === "string" && BRANDS.some((b) => b.id === s.brand) ? s.brand : undefined,
    sso: typeof s.sso === "string" ? s.sso : undefined,
  }),

  head: () => ({
    meta: [
      { title: `Sign in — ${HEAD_BRAND.name}` },
      {
        name: "description",
        content: `Sign in to the ${HEAD_BRAND.name} portal with single sign-on to manage your account, roles and Telegram link.`,
      },
      { property: "og:title", content: `Sign in — ${HEAD_BRAND.name}` },
      {
        property: "og:description",
        content: `Single sign-on access to the ${HEAD_BRAND.name} portal.`,
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${getSiteUrl()}/login` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${getSiteUrl()}/login` }],
  }),
  component: LoginPage,
});

type ProviderConfig = {
  id: ProviderId;
  label: string;
  icon: ReactNode;
};

const PROVIDERS: ProviderConfig[] = [
  {
    id: "apple",
    label: "Apple",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="currentColor">
        <path d="M17.05 20.28c-.98.95-2.05 1.72-3.21 1.72-1.14 0-1.52-.71-2.9-.71s-1.81.69-2.9.71c-1.12.02-2.11-.69-3.17-1.72C3.3 18.73 2 15.68 2 12.51c0-4.1 2.65-6.26 5.17-6.26 1.34 0 2.44.82 3.19.82.72 0 1.96-.86 3.42-.86 1.8 0 3.32.94 4.14 2.21-3.52 1.54-2.93 6.44.53 7.86zM13.67 4.54c0-2.31 1.92-4.19 4.28-4.21.05 2.24-1.83 4.41-4.28 4.21z" />
      </svg>
    ),
  },
  {
    id: "google",
    label: "Google",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    ),
  },
  {
    id: "microsoft",
    label: "Microsoft",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path fill="#F25022" d="M3 3h8v8H3z" />
        <path fill="#7FBA00" d="M13 3h8v8h-8z" />
        <path fill="#00A4EF" d="M3 13h8v8H3z" />
        <path fill="#FFB900" d="M13 13h8v8h-8z" />
      </svg>
    ),
  },
];

function safeNext(next: unknown): string | null {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function LoginPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const brand = useBrand();
  const search = Route.useSearch() as { next?: string; sso?: string };
  const next = safeNext(search.next);
  const [pending, setPending] = useState<ProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configIssues, setConfigIssues] = useState<RedirectIssue[]>([]);
  // This route is client-only (ssr: false), so demo mode can be read up front —
  // resolving it late would let the signed-in redirect fire before we know.
  const [demo] = useState(() => isDemoMode());

  // Community Bridge owns a single, same-origin login. Do not bounce an
  // unauthenticated visitor through Quality or another identity provider:
  // that was the source of the visible second-login loop. Existing shared
  // MyFenrir sessions are still adopted by useAuth before this screen renders.

  // Runtime check: the brand's OAuth return and post-login paths must be
  // same-origin and on the allowed sign-in URL list, or SSO silently bounces.
  useEffect(() => {
    setConfigIssues(validateBrandRedirects(brand, window.location.origin));
  }, [brand]);
  const blocked = configIssues.some((i) => i.field === "oauthReturnPath");

  // Only the providers this brand enables, in the brand's configured order.
  const providers = brand.providers
    .map((id) => PROVIDERS.find((p) => p.id === id))
    .filter((p): p is ProviderConfig => Boolean(p));

  useEffect(() => {
    // In demo mode the mock session already exists — stay here so the sign-in
    // screen (and its simulated actions) can be reviewed.
    if (demo) return;
    if (!loading && session) {
      if (next) window.location.replace(next);
      else navigate({ to: brand.redirect.afterLogin });
    }
  }, [demo, loading, session, navigate, next, brand]);

  async function signIn(provider: ProviderId) {
    if (blocked) return;
    setError(null);
    setPending(provider);

    if (demo) {
      const target = next ?? brand.redirect.afterLogin;
      logDemoEvent("auth", `Mock ${provider} sign-in started`, `brand ${brand.id}`);
      await new Promise((r) => window.setTimeout(r, 800));
      logDemoEvent("auth", `Mock ${provider} sign-in succeeded`, "no provider round-trip");
      setPending(null);
      logDemoEvent("nav", "Redirecting after sign-in", target);
      navigate({ to: target });
      return;
    }

    const callback = new URL("/login", window.location.origin);
    callback.searchParams.set("sso", "0");
    if (next) callback.searchParams.set("next", next);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: provider === "microsoft" ? "azure" : provider,
      options: {
        redirectTo: callback.toString(),
        scopes: provider === "microsoft" ? "email profile" : undefined,
      },
    });
    if (oauthError) {
      setPending(null);
      setError(formatAuthError(oauthError.message));
      return;
    }
  }

  const copy = brandLoginCopy(brand);

  const asciiBoot = [
    "╔══════════════════════════════════════╗",
    "║  FRISKYDEV // COMMUNITY BRIDGE      ║",
    "╠══════════════════════════════════════╣",
    "║  [01] identity channel .... LINKING ║",
    "║  [02] session cipher ...... SYNCING ║",
    "║  [03] community graph .... MAPPING  ║",
    "║  [04] fenrir gate ........ AWAKENING║",
    "╚══════════════════════════════════════╝",
  ];

  return (
    <AuthLayout
      title={copy.headline}
      subtitle={copy.subheadline}
      footer={
        <span className="block space-y-2">
          <span className="block">
            By continuing you agree to our{" "}
            <a
              href={brand.links.terms}
              className="text-foreground/80 underline-offset-4 hover:underline"
            >
              Terms
            </a>{" "}
            and{" "}
            <a
              href={brand.links.privacy}
              className="text-foreground/80 underline-offset-4 hover:underline"
            >
              Privacy Policy
            </a>
            .
          </span>
          <span className="block">
            New here? Read the{" "}
            <Link
              to="/blog/telegram-role-management-guide"
              className="text-foreground/80 underline-offset-4 hover:underline"
            >
              Telegram role management guide
            </Link>
            .
          </span>
        </span>
      }
    >
      <AnimatePresence>
        {pending ? (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020609]/92 px-4 backdrop-blur-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="status"
            aria-live="polite"
            aria-label={`Connecting with ${pending}`}
          >
            <motion.div
              className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-cyan-400/30 bg-black/80 p-5 shadow-[0_0_80px_rgba(34,211,238,0.16)] sm:p-8"
              initial={{ scale: 0.94, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 24 }}
            >
              <motion.div
                className="pointer-events-none absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent"
                animate={{ top: ["5%", "95%", "5%"] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
              />
              <div className="mb-5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-300">
                <span>Fenrir secure handoff</span>
                <motion.span
                  animate={{ opacity: [0.35, 1, 0.35] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                >
                  ● LIVE
                </motion.span>
              </div>
              <pre className="overflow-hidden whitespace-pre font-mono text-[clamp(8px,2.3vw,14px)] leading-[1.75] text-cyan-100/90">
                {asciiBoot.map((line, index) => (
                  <motion.span
                    key={line}
                    className="block"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.09 }}
                  >
                    {line}
                  </motion.span>
                ))}
              </pre>
              <div className="mt-6 h-1 overflow-hidden rounded-full bg-white/5">
                <motion.div
                  className="h-full bg-gradient-to-r from-blue-500 via-cyan-300 to-emerald-400"
                  initial={{ width: "4%" }}
                  animate={{ width: "96%" }}
                  transition={{ duration: 2.2, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-white/45">
                One login · one session · one active community
              </p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {configIssues.length > 0 ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-left"
        >
          <p className="text-sm font-medium text-destructive">
            {blocked ? "Sign-in is misconfigured for this brand" : "Brand configuration warning"}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-destructive/90">
            {configIssues.map((issue) => (
              <li key={issue.field + issue.message}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-2.5">
        {providers.map((p, i) => {
          const isPending = pending === p.id;
          return (
            <Button
              key={p.id}
              type="button"
              size="lg"
              variant={i === 0 ? "default" : "surface"}
              loading={isPending}
              disabled={pending !== null || blocked}
              onClick={() => signIn(p.id)}
              className="w-full justify-center gap-3 rounded-xl"
            >
              <span className="flex h-5 w-5 items-center justify-center">{p.icon}</span>
              <span>{`${copy.signInLabel} ${p.label}`.trim()}</span>
            </Button>
          );
        })}

        {error ? (
          <div
            role="alert"
            aria-live="polite"
            className="mt-1 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <span
              aria-hidden="true"
              className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-destructive"
            />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="relative my-2 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
          <span className="h-px flex-1 bg-border" />
          <span>Encrypted sign-in</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {copy.signUpLabel || copy.forgotLabel ? (
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
            {copy.signUpLabel ? (
              <button
                type="button"
                disabled={pending !== null || blocked || providers.length === 0}
                onClick={() => providers[0] && signIn(providers[0].id)}
                className="font-medium text-foreground/80 underline-offset-4 hover:underline disabled:opacity-50"
              >
                {copy.signUpLabel}
              </button>
            ) : null}
            {copy.forgotLabel ? (
              <a
                href={brand.links.site ?? "/blog/telegram-role-management-guide"}
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {copy.forgotLabel}
              </a>
            ) : null}
          </div>
        ) : null}

        <p className="text-center text-xs text-muted-foreground">
          New here? Your account is created automatically on first sign-in.
        </p>
      </div>
    </AuthLayout>
  );
}
