import { getSiteUrl } from "@/config/site-url";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { GatePreview } from "@/components/gate/gate-preview";
import { GateShare } from "@/components/gate/gate-share";
import { useTrackGateView } from "@/hooks/use-track-gate-view";
import { useAuth } from "@/hooks/use-auth";

import { createGateTelegramHandoff, getPublicGate } from "@/lib/gate.functions";
import { GATE_UNAVAILABLE_MESSAGE, isGateUnavailableError } from "@/lib/gate-availability";
// Copy del Gate: una sola fuente en src/i18n, ya no una isla local.
import { detectLocale, LOCALE_NAMES, LOCALES, type Locale } from "@/i18n/locale";
import { gateCopy, type GateCopy } from "@/i18n/gate";
import {
  requestGateAccess,
  runGateSecurityPreflight,
  type GateSecurityPreflight,
} from "@/lib/access.functions";
import { getPreset } from "@/lib/gate-presets";

// Quality and production deliberately use different Telegram bots.  Never
// hard-code the production username in a public Gate: mobile deep links would
// silently open the wrong bot and the one-time command could not be redeemed.
const TELEGRAM_BOT_USERNAME = (
  (import.meta.env["VITE_TELEGRAM_BOT_USERNAME"] as string | undefined) ?? "Myfenrir_bot"
).replace(/^@/, "");


function telegramDeepLink(start: string) {
  return `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(start)}`;
}

function gateReturnPath(slug: string) {
  return `/g/${encodeURIComponent(slug)}`;
}

function communitySsoUrl(slug: string, brandId: string) {
  const url = new URL("https://www.myfenrir.com/api/auth/community-sso");
  url.searchParams.set("next", `https://communities.myfenrir.com${gateReturnPath(slug)}`);
  url.searchParams.set("brand", brandId);
  return url.toString();
}

export const Route = createFileRoute("/g/$slug")({
  loader: async ({ params }) => {
    try {
      const config = await getPublicGate({ data: { slug: params.slug } });
      if (!config) throw notFound();
      return config;
    } catch (error) {
      // Un fallo de infraestructura NO es un error de render. Si lo dejamos
      // propagar, el boundary de SSR responde 500 y pisa el 503 honesto que
      // getPublicGate ya fijó en la respuesta. Verificado en vivo: al lanzar,
      // el documento salía 500 sin Retry-After. Devolverlo como estado
      // conserva el 503 y las cabeceras. `notFound()` sigue propagándose.
      if (isGateUnavailableError(error)) {
        // El status hay que fijarlo AQUÍ: el que pone getPublicGate lo pisa el
        // render del documento (verificado: lanzando salía 500, devolviendo
        // salía 200). El loader corre dentro del mismo contexto de petición y
        // es el último punto donde el valor sobrevive. Sólo en servidor.
        if (import.meta.env.SSR) {
          const { setResponseStatus } = await import("@tanstack/react-start/server");
          setResponseStatus(503, "Gate directory unavailable");
        }
        return { gateUnavailable: true } as const;
      }
      throw error;
    }
  },
  head: ({ params, loaderData }) => {
    const gate = loaderData && !("gateUnavailable" in loaderData) ? loaderData : undefined;
    return {
      meta: [
        { title: `${gate?.headline ?? "Members only"} — MyFenrir gate` },
        {
          name: "description",
          content: gate?.subheadline ?? "Sign in with single sign-on to continue to the portal.",
        },
        { property: "og:title", content: gate?.headline ?? "MyFenrir gate" },
        {
          property: "og:description",
          content: gate?.subheadline ?? "Secure single sign-on gate.",
        },
        { property: "og:type", content: "website" },
        { name: "fenrir:community-id", content: gate?.community_id ?? "" },
        { name: "fenrir:gate-name", content: gate?.headline ?? "" },
        { property: "og:url", content: `${getSiteUrl()}/g/${params.slug}` },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: `${getSiteUrl()}/g/${params.slug}` }],
    };
  },
  // 503 y 404 son verdades distintas y el visitante debe poder distinguirlas.
  errorComponent: ({ error }) =>
    isGateUnavailableError(error) ? (
      <GateFallback
        title="Gate directory unavailable"
        message={GATE_UNAVAILABLE_MESSAGE}
        tone="unavailable"
      />
    ) : (
      <GateFallback title="Gate unavailable" message="This gate could not be loaded." />
    ),
  notFoundComponent: () => (
    <GateFallback
      title="Gate unavailable"
      message="No Gate is published at this address. Open My Gates to recover the canonical link without changing or duplicating your community."
    />
  ),
  component: GateRouteComponent,
});

/** Separa el estado "no pude comprobar" del render normal del Gate. */
function GateRouteComponent() {
  const data = Route.useLoaderData();
  if (data && "gateUnavailable" in data) {
    return (
      <GateFallback
        title="Gate directory unavailable"
        message={GATE_UNAVAILABLE_MESSAGE}
        tone="unavailable"
      />
    );
  }
  return <PublicGatePage config={data} />;
}

function GateFallback({
  title,
  message,
  tone = "notfound",
}: {
  title: string;
  message: string;
  tone?: "notfound" | "unavailable";
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{message}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {tone === "unavailable" ? (
          // No mandamos al visitante a "recuperar su enlace canónico": su enlace
          // puede estar perfecto y el problema ser nuestro. Sólo reintentar.
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            Try again
          </button>
        ) : (
          <Link
            to="/gates"
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            Find my canonical Gate
          </Link>
        )}
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

function PublicGatePage({ config }: { config: ReturnType<typeof Route.useLoaderData> }) {
  const params = Route.useParams();
  const preset = getPreset(config.preset);
  const { session, loading, roleLoading, telegramId, isStaff } = useAuth();
  const createTelegramHandoff = useServerFn(createGateTelegramHandoff);
  const requestAccess = useServerFn(requestGateAccess);
  const runSecurityPreflight = useServerFn(runGateSecurityPreflight);
  const [locale, setLocale] = useState<Locale>(detectLocale);
  const [handoffPending, setHandoffPending] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [accessRequested, setAccessRequested] = useState(false);
  const [securityPreflight, setSecurityPreflight] = useState<GateSecurityPreflight | null>(null);
  const [gateOutcome, setGateOutcome] = useState<"granted" | "review" | "pending" | "blocked" | null>(null);

  const checkingAccess = loading || roleLoading;
  const telegramReady = Boolean(session && telegramId);
  const telegramCommunity = config.community_id;
  const communityConfirmed = Boolean(telegramCommunity);
  const ssoHref = communitySsoUrl(params.slug, config.brand_id);
  // A visitor's first Gate action is ALTCHA, then MyFenrir SSO. Once SSO has
  // returned a session, the Gate must run the security preflight instead of
  // bouncing back to SSO because a Telegram signal is incomplete.
  const needsSso = checkingAccess || !session;
  // `isStaff` can hydrate from a cached role result before an SSO session is
  // available. Public visitors must never see the internal Gates shortcut in
  // that transient state; it strands them at a second login wall instead of
  // starting the Gate's SSO journey.
  const authenticatedStaff = Boolean(session && isStaff);
  const copy = gateCopy[locale];

  useTrackGateView(params.slug, config.preset);

  async function continueToTelegram() {
    setHandoffPending(true);
    setHandoffError(null);
    try {
      const { token } = await createTelegramHandoff({ data: { slug: params.slug } });
      window.location.assign(telegramDeepLink(token));
    } catch (error) {
      setHandoffError(error instanceof Error ? error.message : "Could not start the secure Telegram handoff.");
    } finally {
      setHandoffPending(false);
    }
  }

  async function runSecurityThenRequestAccess() {
    setHandoffPending(true);
    setHandoffError(null);
    try {
      const preflight = await runSecurityPreflight({ data: { slug: params.slug } });
      setSecurityPreflight(preflight);
      if (preflight.status === "sso_required") {
        window.location.assign(communitySsoUrl(params.slug, config.brand_id));
        return;
      }
      if (preflight.status === "blocked") {
        setGateOutcome("blocked");
        setHandoffError("Access blocked by the Gate security screen.");
        return;
      }
      if (preflight.status === "review") {
        const result = await requestAccess({ data: { slug: params.slug } });
        setAccessRequested(true);
        setGateOutcome(result.status === "granted" ? "granted" : "review");
        return;
      }
      const result = await requestAccess({ data: { slug: params.slug } });
      setGateOutcome(result.status === "granted" ? "granted" : result.status === "pending" ? "pending" : "review");
      if (result.status === "granted") {
        await continueToTelegram();
        return;
      }
      setAccessRequested(true);
    } catch (error) {
      setHandoffError(error instanceof Error ? error.message : "Could not submit your access request.");
    } finally {
      setHandoffPending(false);
    }
  }

  return (
    <div className="relative">
      <GatePreview
        config={{
          ...config,
          // An owner landing back on a public Gate already has a valid
          // session. Leaving the visitor-only "Sign in" subtitle here made
          // that otherwise correct "Open my Gates" shortcut look broken.
          subheadline: authenticatedStaff ? copy.ownerAccessActive : config.subheadline,
        }}
        hideLogo
        actionHref={
          authenticatedStaff
            ? "/gates"
            : needsSso
              ? ssoHref
              : undefined
        }
        actionLabel={
          authenticatedStaff
            ? copy.openMyGates
            : needsSso
              ? copy.proceedSso
              : handoffError
                ? handoffError
                : handoffPending
                  ? copy.runningSecurity
                  : accessRequested
                    ? copy.reviewSubmitted
                    : communityConfirmed
                      ? copy.continueGate
                      : copy.proceedSso
        }
        onAction={
          session && !authenticatedStaff && !accessRequested && communityConfirmed
            ? runSecurityThenRequestAccess
            : undefined
        }
        actionPending={handoffPending}
      />
      <GateLanguageSwitcher locale={locale} onChange={setLocale} />
      {securityPreflight ? (
        <GateSecurityPanel preflight={securityPreflight} copy={copy} />
      ) : null}
      {gateOutcome ? (
        <GateOutcomeCelebration outcome={gateOutcome} email={session?.user.email ?? null} copy={copy} />
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-5 pb-8">
        <GateShare slug={params.slug} accent={preset.accent} />
      </div>
    </div>
  );
}

function GateOutcomeCelebration({
  outcome,
  email,
  copy,
}: {
  outcome: "granted" | "review" | "pending" | "blocked";
  email: string | null;
  copy: GateCopy;
}) {
  const outcomeCopy =
    outcome === "granted"
      ? { title: copy.grantedTitle, body: copy.grantedBody }
      : outcome === "blocked"
        ? { title: copy.blockedTitle, body: copy.blockedBody }
        : { title: copy.reviewTitle, body: copy.reviewBody };
  return (
    <aside className="absolute inset-x-0 top-8 z-20 mx-auto w-[min(92vw,430px)] overflow-hidden rounded-3xl border border-white/15 bg-black/75 p-5 text-white shadow-2xl backdrop-blur-xl">
      {outcome === "granted" ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,229,255,.38),transparent_28%),radial-gradient(circle_at_80%_30%,rgba(255,91,217,.30),transparent_25%),radial-gradient(circle_at_50%_100%,rgba(255,217,102,.26),transparent_28%)]" />
      ) : null}
      <div className="relative">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/45">
          {copy.resultLabel}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">{outcomeCopy.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/68">{outcomeCopy.body}</p>
        {email ? <p className="mt-3 text-xs text-white/42">{copy.emailPrefix}: {email}</p> : null}
      </div>
    </aside>
  );
}

function GateSecurityPanel({ preflight, copy }: { preflight: GateSecurityPreflight; copy: GateCopy }) {
  return (
    <aside className="absolute inset-x-0 bottom-24 z-10 mx-auto w-[min(92vw,430px)] rounded-3xl border border-white/12 bg-black/70 p-4 text-white shadow-2xl backdrop-blur-xl">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
        {copy.securityComplete}
      </p>
      <div className="mt-3 grid gap-2">
        {preflight.checks.map((check) => (
          <div key={check.key} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs">
            <span>{check.label}</span>
            <span className="font-mono uppercase tracking-[0.16em] text-white/60">{check.status}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function GateLanguageSwitcher({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
}) {
  return (
    <div
      aria-label="Choose language"
      className="absolute right-4 top-4 z-20 rounded-full border border-white/12 bg-black/35 p-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55 shadow-2xl backdrop-blur-xl"
      role="group"
    >
      {LOCALES.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={`rounded-full px-3 py-1.5 transition ${locale === item ? "bg-white text-black" : "hover:bg-white/10 hover:text-white"}`}
          aria-label={LOCALE_NAMES[item]}
          aria-pressed={locale === item}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
