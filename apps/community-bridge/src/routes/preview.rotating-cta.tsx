import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Send } from "lucide-react";

import { RotatingCtaButton } from "@/components/marketing/rotating-cta-button";

/**
 * Isolated preview for <RotatingCtaButton />. Not linked from anywhere and
 * noindex — it exists so the component can be reviewed before deciding where
 * it lands (the obvious candidates are the /activate and /gate Telegram CTAs).
 */
export const Route = createFileRoute("/preview/rotating-cta")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Rotating CTA badge — preview" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RotatingCtaPreview,
});

const BOT_USERNAME =
  (import.meta.env["VITE_TELEGRAM_BOT_USERNAME"] as string | undefined) ?? "Myfenrir_bot";
const BOT_URL = `https://t.me/${BOT_USERNAME}`;

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card/60 p-6 backdrop-blur-sm">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-1 max-w-prose text-[12px] leading-relaxed text-muted-foreground">{note}</p>
      <div className="mt-6 flex flex-wrap items-center gap-8">{children}</div>
    </section>
  );
}

function RotatingCtaPreview() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-6 py-16">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Rotating CTA badge</h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Two tones, one component. The ring caption is decorative and hidden from assistive
          tech; every badge announces its own action. Tab to a badge to see the focus ring and
          the icon swap. With <code className="text-foreground">prefers-reduced-motion</code> the
          ring stops turning, the scale is dropped and the icon no longer travels.
        </p>
      </header>

      <Panel
        title="Tone: crimson — MyFenrir design system"
        note="Resolves to --primary, --card, --foreground, --background and --ring. No literal colours. This is the default and the tone applied for any generic CTA."
      >
        <RotatingCtaButton label="Design your gate" ringText="DESIGN YOUR GATE ·" />
        <RotatingCtaButton
          label="Open the dashboard"
          ringText="OPEN THE DASHBOARD · NOW ·"
          size={128}
          coreSize={52}
        />
        <RotatingCtaButton label="Go" ringText="GO ·" size={84} coreSize={34} />
      </Panel>

      <Panel
        title="Tone: telegram — external brand colour"
        note="#2aabee is Telegram's own blue. It is declared once, scoped to this variant, and never enters styles.css. Use it only when the button genuinely opens Telegram."
      >
        <RotatingCtaButton
          tone="telegram"
          label={`Open the Gatekeeper bot on Telegram (@${BOT_USERNAME})`}
          ringText="OPEN THE GATEKEEPER BOT ·"
          href={BOT_URL}
          target="_blank"
          rel="noreferrer noopener"
          icon={<Send size={18} strokeWidth={2.25} aria-hidden="true" />}
        />
        <RotatingCtaButton
          tone="telegram"
          label="Link your Telegram account"
          ringText="LINK TELEGRAM ·"
          size={128}
          coreSize={52}
          icon={<Send size={22} strokeWidth={2.25} aria-hidden="true" />}
        />
      </Panel>

      <Panel
        title="Caption length"
        note="The source CSS hard-coded 20deg per character, which silently clips anything past 18 characters. The component derives 360/length instead, so these all close the circle exactly once."
      >
        <RotatingCtaButton label="Short caption" ringText="SHORT ·" />
        <RotatingCtaButton label="Eighteen characters" ringText="EIGHTEEN CHARS ·  " />
        <RotatingCtaButton
          label="A caption well past the old eighteen character limit"
          ringText="A VERY LONG CAPTION THAT WOULD HAVE BEEN CLIPPED ·"
        />
      </Panel>

      <Panel
        title="Disabled"
        note="Pointer events stay live for the cursor affordance but the scale is removed."
      >
        <RotatingCtaButton label="Unavailable" ringText="UNAVAILABLE ·" disabled />
      </Panel>
    </main>
  );
}
