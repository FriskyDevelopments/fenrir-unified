import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import "./telegram-preview-demo.css";

/**
 * Telegram preview · visual-lab demonstration.
 *
 * Recovered from fenrir-unified @ 7760635^ (the commit "replace mock Telegram
 * phone with live handoff" removed it from the Community Bridge onboarding
 * flow, and rightly so: in that position a mock screen could be mistaken for
 * real account state).
 *
 * It returns here ILLUSTRATIVE ONLY, on the visual lab, and the decoupling is
 * structural rather than a promise:
 *   · The component takes NO props. There is no `telegramLinked`, no
 *     `mappingVerified`, no `linkedTelegram` — nothing real can reach it.
 *   · Step state is local and self-driven; it advances on a timer or by user
 *     interaction, exactly like the rest of the lab's preview blocks.
 *   · The launch affordance is inert markup, not an anchor, so a demo can
 *     never open a real Telegram link flow.
 *   · It is labelled as a demonstration in the chrome AND inside the frame.
 *
 * Preserved verbatim from the original: the live clock (Intl.DateTimeFormat on
 * a 30s interval), the AnimatePresence `mode="wait"` spring (stiffness 340 /
 * damping 24) with the blur-out exit, the 550ms ease-out tap ripple, and the
 * rule that no state is signalled by colour alone — every state carries a
 * glyph (✓ / ○) and a word.
 */

const STEPS = [
  {
    label: "Link ID",
    title: "Link your FriskyDev ID",
    message: "Connect this Telegram account to your FriskyDev identity.",
    detail: "The secure link is single-use and confirms which Telegram account belongs to you.",
    launch: "Link FriskyDev ID",
    advance: "Link FriskyDev ID with Telegram",
  },
  {
    label: "Account",
    title: "Identity linked",
    message: "Welcome. Your MyFenrir account is linked with Frisky Dev.",
    detail: "This Telegram identity can now manage the community setup.",
    launch: "Open MyFenrir Bot",
    advance: "Continue to group setup",
  },
  {
    label: "Group",
    title: "Protected group",
    message: "Add @Myfenrir_bot to the group and grant Invite Users.",
    detail: "Fenrir keeps the real destination private behind the Gate.",
    launch: "Link a Telegram group",
    advance: "Continue to mapping",
  },
  {
    label: "Mapping",
    title: "Map the destination",
    message: "Run /connect@Myfenrir_bot in the protected group.",
    detail: "The public Gate remains pending until this mapping is verified.",
    launch: "Open mapping in Telegram",
    advance: "Confirm access",
  },
  {
    label: "Access",
    title: "Access confirmed",
    message: "Your identity and community access have been confirmed.",
    detail: "A private one-person Telegram handoff is ready. You can now close the Mini App safely.",
    launch: "Open readiness in Telegram",
    advance: "Close Mini App",
  },
] as const;

const LAST = STEPS.length - 1;
const AUTOPLAY_MS = 4800;

export function TelegramPreviewDemo({ realGateHref }: { realGateHref: string }) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [closed, setClosed] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [phoneTime, setPhoneTime] = useState("--:--");

  // Live clock — the detail the reduced port threw away by hardcoding "9:41".
  useEffect(() => {
    const tick = () =>
      setPhoneTime(
        new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date())
      );
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Self-driven progression. Stops the moment a visitor takes over, and never
  // starts at all when the visitor asked for reduced motion.
  useEffect(() => {
    if (!autoplay || reduced || closed) return;
    const timer = window.setTimeout(() => {
      setStep((current) => (current >= LAST ? 0 : current + 1));
    }, AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [autoplay, reduced, closed, step]);

  function takeOver(next: number) {
    setAutoplay(false);
    setClosed(false);
    setStep(next);
  }

  function advance() {
    setAutoplay(false);
    if (step === LAST) {
      setClosed(true);
      // Haptic only, if we happen to be inside Telegram. A demonstration must
      // never call WebApp.close() — that would dismiss a real Mini App.
      (
        window as Window & {
          Telegram?: {
            WebApp?: { HapticFeedback?: { notificationOccurred?: (type: "success") => void } };
          };
        }
      ).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success");
      return;
    }
    setStep((current) => Math.min(current + 1, LAST));
  }

  const current = STEPS[step];
  const bubbleTransition = reduced
    ? { duration: 0 }
    : ({ type: "spring", stiffness: 340, damping: 24 } as const);

  return (
    <section className="tpd" aria-labelledby="tpd-title">
      <div className="tpd__copy">
        <span className="tpd__label">TELEGRAM HANDOFF · DEMONSTRATION</span>
        <h2 id="tpd-title">
          What the bot
          <br />
          says, step by step.
        </h2>
        <p>
          The private conversation a community owner has with @Myfenrir_bot, from linking an
          identity to confirming access — replayed here so you can read it before you ever start.
        </p>
        <p>
          <span className="tpd__flag">Preview · demonstration</span>
        </p>
        <a className="tpd__cta" href={realGateHref}>
          Do it for real in Community Bridge
        </a>
        <p className="tpd__note">
          Illustrative states only. This block holds no account data and reflects no one&rsquo;s real
          setup: identity, mapping and access decisions are all server-authorized, and only the real
          bot can report them.
        </p>
      </div>

      <div className="tpd__stage">
        <div className="tpd__frame">
          <div className="tpd__screen">
            <div className="tpd__notch" aria-hidden="true" />

            <div className="tpd__statusbar">
              <span>{phoneTime}</span>
              <span>5G&nbsp;&nbsp;●</span>
            </div>

            <div className="tpd__chathead">
              <span className="tpd__back" aria-hidden="true">
                ‹
              </span>
              <div className="tpd__avatar" aria-hidden="true">
                🐺
              </div>
              <div className="tpd__who">
                <b>MyFenrir Bot</b>
                <span>bot · secure connection</span>
              </div>
              <span className="tpd__more" aria-hidden="true">
                •••
              </span>
            </div>

            <div className="tpd__tabs" role="tablist" aria-label="Telegram demonstration steps">
              {STEPS.map((item, index) => {
                const seen = index < step;
                const isCurrent = index === step;
                return (
                  <button
                    key={item.label}
                    type="button"
                    role="tab"
                    aria-selected={isCurrent}
                    onClick={() => takeOver(index)}
                    className="tpd__tab"
                  >
                    {isCurrent && !reduced ? (
                      <span className="tpd__sweep" aria-hidden="true" />
                    ) : null}
                    <span className="tpd__tab-n">Step {index + 1}</span>
                    <span className="tpd__tab-label">{item.label}</span>
                    <span
                      className={`tpd__tab-state ${
                        seen
                          ? "tpd__tab-state--seen"
                          : isCurrent
                            ? "tpd__tab-state--current"
                            : ""
                      }`}
                    >
                      {seen ? "✓ Seen" : isCurrent ? "○ Showing" : "○ Next"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="tpd__chat">
              <p className="tpd__daymark">Demonstration · not real data</p>

              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, scale: 0.86, y: 14 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 1.08, filter: "blur(7px)" }}
                  transition={bubbleTransition}
                  className={`tpd__bubble ${step === LAST ? "tpd__bubble--done" : ""}`}
                >
                  {reduced ? null : (
                    <motion.div
                      aria-hidden="true"
                      initial={{ scale: 0, opacity: 0.9 }}
                      animate={{ scale: 1, opacity: 0 }}
                      transition={{ duration: 0.55, ease: "easeOut" }}
                      className="tpd__ripple"
                    />
                  )}
                  <p className="tpd__bubble-title">
                    🐺 MyFenrir · Step {step + 1} of {STEPS.length}
                  </p>
                  <p className="tpd__bubble-sub">{current.title}</p>
                  <p>{current.message}</p>
                  <p className="tpd__bubble-detail">{current.detail}</p>
                  {step === LAST ? (
                    <div className="tpd__confirm">
                      <span className="tpd__confirm-tick" aria-hidden="true">
                        ✓
                      </span>
                      <b>ACCESS CONFIRMED</b>
                      <small>Identity · rules · membership · destination</small>
                    </div>
                  ) : null}
                </motion.div>
              </AnimatePresence>

              <span className="tpd__launch" role="presentation">
                {current.launch} ↗
              </span>

              {closed ? (
                <div className="tpd__closed" role="status" aria-live="polite">
                  <b>Mini App closed safely</b>
                  <small>Return to Telegram to use your private access.</small>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={advance}
                  className={`tpd__advance ${step === LAST ? "tpd__advance--done" : ""}`}
                >
                  {current.advance}
                </button>
              )}
            </div>

            <div className="tpd__composer" aria-hidden="true">
              Message <span>➤</span>
            </div>
          </div>
        </div>

        <p className="tpd__caption">
          Simulated Telegram interface · no Gate is created from this visual lab
        </p>
      </div>
    </section>
  );
}
