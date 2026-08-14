import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { useBrand } from "@/config/brand-context";
import { BRANDS, brandLoginCopy, getBrand } from "@/config/brands";
import { isDemoMode } from "@/config/demo-mode";
import { logDemoEvent } from "@/config/demo-log";
import { getSiteUrl } from "@/config/site-url";
import { getCommunitySession } from "@/lib/authentik.functions";
import { UiverseLift, UiverseSweep } from "@/components/ui/uiverse-motion";

/**
 * Community Bridge login boundary.
 *
 * This route talks ONLY to the Community Authentik OIDC application. It never
 * starts Supabase OAuth and never hands the visitor to the MyFenrir/FriskyDev
 * login surface or reuses its application session. When AUTHENTIK_* secrets are
 * absent it shows an explicit "not configured" state rather than silently
 * falling back to the shared identity provider.
 */

/** Build-time brand: head() is static, so it uses the deployment's brand. */
const HEAD_BRAND = getBrand(import.meta.env["VITE_BRAND_ID"]);

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (s: {
    next?: unknown;
    brand?: unknown;
    slug?: unknown;
    error?: unknown;
    ref?: unknown;
  }): { next?: string; brand?: string; slug?: string; error?: string; ref?: string } => ({
    next: typeof s.next === "string" ? s.next : undefined,
    brand:
      typeof s.brand === "string" && BRANDS.some((b) => b.id === s.brand)
        ? s.brand
        : undefined,
    slug: typeof s.slug === "string" ? s.slug : undefined,
    error: typeof s.error === "string" ? s.error : undefined,
    ref: typeof s.ref === "string" && /^[a-f0-9-]{8}$/i.test(s.ref) ? s.ref : undefined,
  }),

  head: () => ({
    meta: [
      { title: `Sign in — ${HEAD_BRAND.name}` },
      {
        name: "description",
        content: `Sign in to the ${HEAD_BRAND.name} portal with your Community account to continue to your Gate.`,
      },
      { property: "og:title", content: `Sign in — ${HEAD_BRAND.name}` },
      {
        property: "og:description",
        content: `Community sign-in for the ${HEAD_BRAND.name} portal.`,
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${getSiteUrl()}/login` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${getSiteUrl()}/login` }],
  }),
  component: LoginPage,
});

function safeNext(next: unknown): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("://")) return null;
  return next;
}

const CALLBACK_ERRORS: Record<string, string> = {
  access_denied: "You cancelled Community sign-in.",
  sign_in_access_denied: "You cancelled Community sign-in.",
  not_configured: "Community sign-in is not configured yet.",
  missing_code_or_state: "The sign-in request was incomplete. Please try again.",
  missing_oauth_cookie: "Your sign-in session expired. Please try again.",
  invalid_oauth_cookie: "Your sign-in session was invalid. Please try again.",
  state_mismatch: "The sign-in request could not be verified. Please try again.",
  state_invalid_or_expired: "Your sign-in session expired. Please try again.",
  nonce_mismatch: "The sign-in request could not be verified. Please try again.",
  callback_failed: "Community sign-in failed. Please try again.",
  code_expired_or_reused: "That sign-in link expired or was already used. Start a fresh Community sign-in.",
  token_exchange_failed: "Community could not complete the identity handoff. Please try again.",
  token_validation_failed: "Community could not verify the identity response. Please try again.",
  identity_mapping_failed: "Community sign-in is not configured yet.",
};

function callbackError(error?: string): string | null {
  if (!error) return null;
  return CALLBACK_ERRORS[error] ?? "Community sign-in failed. Please try again.";
}

function LoginPage() {
  const navigate = useNavigate();
  const brand = useBrand();
  const search = Route.useSearch() as { next?: string; slug?: string; error?: string; ref?: string };
  const next = safeNext(search.next);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(() => callbackError(search.error));
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const [demo] = useState(() => isDemoMode());

  const fetchSession = useServerFn(getCommunitySession);

  // Returning Community members must never see a login-form flash: resolve the
  // existing HttpOnly Community session first and go straight back to the Gate.
  useEffect(() => {
    if (demo) {
      setChecking(false);
      return;
    }
    let active = true;
    void fetchSession()
      .then(({ configured: isConfigured, session }) => {
        if (!active) return;
        setConfigured(isConfigured);
        if (session) {
          window.location.replace(next ?? brand.redirect.afterLogin);
          return;
        }
        setChecking(false);
      })
      .catch(() => {
        if (!active) return;
        setConfigured(false);
        setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [demo, fetchSession, next, brand]);

  async function startCommunitySignIn() {
    if (configured === false) return;
    setError(null);
    setPending(true);

    if (demo) {
      const target = next ?? brand.redirect.afterLogin;
      logDemoEvent("auth", "Mock Community sign-in started", `brand ${brand.id}`);
      await new Promise((r) => window.setTimeout(r, 800));
      logDemoEvent("auth", "Mock Community sign-in succeeded", "no Authentik round-trip");
      setPending(false);
      navigate({ to: target });
      return;
    }

    const params = new URLSearchParams({
      community: brand.community.id,
      brand: brand.id,
      next: next ?? brand.redirect.afterLogin,
    });
    if (search.slug) params.set("slug", search.slug);
    window.location.assign(`/auth/start?${params.toString()}`);
  }

  const copy = brandLoginCopy(brand);

  if (checking) {
    return (
      <div className="min-h-dvh bg-background" aria-busy="true" aria-label="Checking your secure session" />
    );
  }

  return (
    <AuthLayout
      title={copy.headline}
      subtitle={copy.subheadline}
      footer={
        <span className="block space-y-2">
          <span className="block">
            By continuing you agree to our{" "}
            <a href={brand.links.terms} className="text-foreground/80 underline-offset-4 hover:underline">
              Terms
            </a>{" "}
            and{" "}
            <a href={brand.links.privacy} className="text-foreground/80 underline-offset-4 hover:underline">
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
      {configured === false ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-left">
          <p className="text-sm font-medium text-destructive">Community sign-in is not configured yet</p>
          <p className="mt-1 text-xs leading-relaxed text-destructive/90">
            The Community Bridge identity provider (Authentik) is still being provisioned. Please try
            again shortly.
          </p>
        </div>
      ) : (
        <div className="grid gap-2.5">
          {error ? (
            <div
              role="alert"
              aria-live="polite"
              className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <span aria-hidden="true" className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-destructive" />
              <span>{error}</span>
            </div>
          ) : null}
          {error && search.ref ? (
            <p className="text-center font-mono text-[11px] text-muted-foreground">Reference {search.ref}</p>
          ) : null}

          <UiverseLift disabled={pending || configured === null}>
            <Button
              type="button"
              size="lg"
              loading={pending}
              disabled={pending || configured === null}
              onClick={startCommunitySignIn}
              className="group relative w-full justify-center gap-3 overflow-hidden rounded-xl"
            >
              <UiverseSweep />
              <ShieldCheck className="relative h-5 w-5 transition-transform duration-300 group-hover:rotate-6" aria-hidden="true" />
              <span className="relative">{`${copy.signInLabel} Community`.trim()}</span>
            </Button>
          </UiverseLift>

          <div className="relative my-2 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
            <span className="h-px flex-1 bg-border" />
            <span>Encrypted sign-in</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <p className="text-center text-xs text-muted-foreground">
            New here? Your account is created automatically on first sign-in.
          </p>
        </div>
      )}
    </AuthLayout>
  );
}
