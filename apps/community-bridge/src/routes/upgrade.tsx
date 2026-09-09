import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Activity, LockKeyhole, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { PackRails } from "@/components/billing/pack-rails";
import { CosmicField } from "@/components/billing/cosmic-field";

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

/**
 * Copy as keys, not loose literals, so a translation layer can be added later
 * without touching the markup. English is the base and the only set shipped
 * today. `community-bridge` has no i18n system yet; when one lands, follow
 * apps/fenrir-bridge/src/i18n.ts rather than inventing another.
 */
const COPY = {
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
} as const;

const CAP_ICONS = [ShieldCheck, LockKeyhole, Activity] as const;

export const Route = createFileRoute("/upgrade")({ ssr: false, component: UpgradePage });

function UpgradePage() {
  // Honour the OS "reduce motion" setting: everything below mounts static.
  const reduce = useReducedMotion();
  const t = COPY;

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
      {/* Cosmic ground — star field, nebula and the occasional comet, with
          pointer parallax. Fenrir is a wolf out of a night sky; the substrate
          says so. See cosmic-field.tsx for why each layer is allowed to move. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <CosmicField className="absolute inset-0 h-full w-full" />
        {/* The real FriskyDev sigil as a watermark, masked so the artwork is
            never redrawn. It breathes on a 26s cycle — slow enough to register
            as presence rather than animation. */}
        <motion.div
          className="absolute -right-[12%] top-1/2 hidden h-[62vmin] w-[62vmin] -translate-y-1/2 lg:block"
          style={{
            backgroundImage:
              "linear-gradient(160deg, rgba(183,255,42,0.09), rgba(139,124,255,0.05))",
            WebkitMaskImage: "url(/brand/friskydev-sigil-solid.svg)",
            maskImage: "url(/brand/friskydev-sigil-solid.svg)",
            WebkitMaskSize: "contain",
            maskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
          }}
          animate={reduce ? undefined : { opacity: [0.55, 0.95, 0.55], scale: [1, 1.02, 1] }}
          transition={reduce ? undefined : { duration: 26, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Vignette: keeps the star field from crowding the copy edges. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 45%, transparent 40%, rgba(8,11,22,0.72) 100%)",
          }}
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

        <section
          className="border-t py-12 sm:py-16"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
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
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fd-muted)" }}>
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
