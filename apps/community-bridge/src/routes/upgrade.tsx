import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Activity, LockKeyhole, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { PackRails } from "@/components/billing/pack-rails";

/**
 * /upgrade — the OPERATOR checkout.
 *
 * Audience: the person who administers a community and pays $14.99/month per
 * linked community. NOT the member arriving at a Gate. Nothing here sells
 * belonging; it sells control, reliability, and a door that does not fall over.
 *
 * SURFACE NOTE (diagnosis, not a change): this route currently ships from the
 * same app and the same host as the member Gate (`communities.myfenrir.com`,
 * see src/config/brands.ts). It is written to be liftable to the operator's own
 * domain — it declares its own colour tokens instead of inheriting the Gate
 * theme, and it deliberately does not load telegram-web-app.js. See
 * BILLING_SURFACE_NOTES.md for the full map and why the move matters.
 */

const LOCALES = ["es", "en"] as const;
type Locale = (typeof LOCALES)[number];

function normalizeLocale(value: string | null | undefined): Locale {
  const normalized = (value ?? "").slice(0, 2).toLowerCase();
  return normalized === "en" ? "en" : "es";
}

const COPY = {
  es: {
    back: "Tus gates",
    eyebrow: "Consola del operador",
    title: "Tu puerta no se cae.",
    lede: "The Pack es la capa de admisión de la comunidad que administras: reglas de entrada, registro de quién entró y una dirección que sigue respondiendo cuando tú no estás mirando.",
    sectionEyebrow: "Qué compras",
    sectionTitle: "Tres cosas que dejan de ser tu problema.",
    caps: [
      {
        title: "Una dirección administrada",
        body: "Cada Gate recibe una URL MyFenrir gestionada. Sin DNS, sin certificados, sin una noche arreglando un dominio caído.",
      },
      {
        title: "Admisión con criterio",
        body: "Defines las reglas de entrada que tu comunidad necesita y se aplican igual a las tres de la mañana que a las tres de la tarde.",
      },
      {
        title: "Registro y reportes",
        body: "Vistas del Gate, tendencia de siete días, referrers y visitantes únicos por día, listos para sincronizar con tu proyecto de PostHog.",
      },
    ],
    footNote: "El cobro es por comunidad enlazada. Si administras dos, son dos.",
  },
  en: {
    back: "Your gates",
    eyebrow: "Operator console",
    title: "The door holds.",
    lede: "The Pack is the admission layer for the community you run: entry rules, a record of who came through, and an address that keeps answering when you are not watching.",
    sectionEyebrow: "What you are buying",
    sectionTitle: "Three things that stop being your problem.",
    caps: [
      {
        title: "A managed address",
        body: "Every Gate gets a managed MyFenrir URL. No DNS, no certificates, no evening spent fixing a domain that went down.",
      },
      {
        title: "Admission with judgement",
        body: "You set the entry rules your community needs and they apply the same at three in the morning as at three in the afternoon.",
      },
      {
        title: "Record and reports",
        body: "Gate views, seven-day trend, referrers and unique daily visitors, ready to sync with your PostHog project.",
      },
    ],
    footNote: "Billing is per linked community. Run two, pay for two.",
  },
} satisfies Record<Locale, unknown>;

const CAP_ICONS = [ShieldCheck, LockKeyhole, Activity] as const;

export const Route = createFileRoute("/upgrade")({ ssr: false, component: UpgradePage });

function UpgradePage() {
  // Honour the OS "reduce motion" setting: everything below mounts static.
  const reduce = useReducedMotion();
  const [locale, setLocale] = useState<Locale>("es");
  const t = COPY[locale];

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("lang");
    const stored = window.localStorage.getItem("myfenrir_locale");
    setLocale(normalizeLocale(requested ?? stored ?? navigator.language));
  }, []);

  return (
    <main
      className="min-h-dvh px-5 py-8 sm:px-8 sm:py-12"
      style={{
        // Own tokens. Nothing here reads the member-Gate theme, so the page can
        // move to the operator's domain without a re-skin.
        ["--fd-midnight" as string]: "#080B16",
        ["--fd-surface" as string]: "#0B0E1A",
        ["--fd-indigo" as string]: "#161C3D",
        ["--fd-lime" as string]: "#b7ff2a",
        ["--fd-violet" as string]: "#8B7CFF",
        ["--fd-ice" as string]: "#ECEEFF",
        ["--fd-muted" as string]: "#9AA0C7",
        background: "#080B16",
        color: "#ECEEFF",
      }}
    >
      {/* Ground. One very slow indigo drift, 34s — slower than a reading pass,
          so it never competes with the price for attention. It exists to keep a
          large dark field from looking dead, nothing more. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <motion.div
          className="absolute inset-[-30%]"
          style={{
            background:
              "radial-gradient(34% 30% at 22% 20%, rgba(139,124,255,0.16), transparent 62%), radial-gradient(30% 28% at 80% 76%, rgba(183,255,42,0.07), transparent 62%)",
          }}
          animate={reduce ? undefined : { rotate: [0, 5, 0], scale: [1, 1.04, 1] }}
          transition={reduce ? undefined : { duration: 34, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="mx-auto max-w-6xl">
        <Link
          to="/gates"
          className="inline-flex items-center gap-1 text-sm transition-colors"
          style={{ color: "var(--fd-muted)" }}
        >
          <ArrowLeft className="h-4 w-4" /> {t.back}
        </Link>

        <section className="grid gap-10 pb-12 pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-20">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Vendor lockup: the real sigil as an <img>, and the wordmark set
                as type. NOTE: no clean FriskyDev wordmark file exists on disk —
                only raster brand sheets — so the name is typeset rather than
                faked as vector art. Spelling per frisky-brand-registry.md. */}
            <div className="flex items-center gap-2.5">
              <img
                src="/brand/friskydev-sigil-lime.svg"
                alt="Frisky Developments"
                draggable={false}
                className="h-6 w-6"
              />
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.24em]"
                style={{ color: "var(--fd-muted)" }}
              >
                Frisky Developments
              </span>
            </div>

            <p
              className="mt-8 text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: "var(--fd-lime)" }}
            >
              {t.eyebrow}
            </p>
            <h1
              className="mt-4 max-w-2xl text-5xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-6xl lg:text-7xl"
              style={{ color: "var(--fd-ice)" }}
            >
              {t.title}
            </h1>
            <p
              className="mt-6 max-w-xl text-base leading-relaxed sm:text-lg"
              style={{ color: "var(--fd-muted)" }}
            >
              {t.lede}
            </p>
          </motion.div>

          <motion.aside
            id="pack-rails"
            className="scroll-mt-24"
            initial={reduce ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <PackRails />
          </motion.aside>
        </section>

        <section className="border-t py-12 sm:py-16" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div className="mb-9 max-w-2xl">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: "var(--fd-lime)" }}
            >
              {t.sectionEyebrow}
            </p>
            <h2
              className="mt-3 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl"
              style={{ color: "var(--fd-ice)" }}
            >
              {t.sectionTitle}
            </h2>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {t.caps.map((cap, index) => {
              const Icon = CAP_ICONS[index] ?? ShieldCheck;
              return (
                <motion.article
                  key={cap.title}
                  /* Entrance only, staggered left to right, so the three read as
                     a sequence rather than appearing as a block. No hover
                     zoom — these are statements, not buttons. */
                  initial={reduce ? false : { opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ delay: reduce ? 0 : index * 0.08, duration: 0.42 }}
                  className="rounded-3xl border p-6 sm:p-7"
                  style={{
                    borderColor: "rgba(255,255,255,0.08)",
                    background: "rgba(22,28,61,0.35)",
                  }}
                >
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-2xl"
                    style={{ background: "rgba(183,255,42,0.10)", color: "var(--fd-lime)" }}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-7 text-lg font-semibold" style={{ color: "var(--fd-ice)" }}>
                    {cap.title}
                  </h3>
                  <p
                    className="mt-2 text-sm leading-relaxed"
                    style={{ color: "var(--fd-muted)" }}
                  >
                    {cap.body}
                  </p>
                </motion.article>
              );
            })}
          </div>

          <p className="mt-8 text-sm" style={{ color: "var(--fd-muted)" }}>
            {t.footNote}
          </p>
        </section>
      </div>
    </main>
  );
}
