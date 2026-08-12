import "altcha";
import { useEffect, useRef, useState } from "react";

const CHALLENGE_URL = "https://dediny.tailab8146.ts.net/v1/challenge";

export function AltchaGate({ onVerified }: { onVerified: (verified: boolean) => void }) {
  const widgetRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState("Complete the privacy-safe check to continue.");

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) return;
    const handleState = (event: Event) => {
      const state = (event as AltchaStateChangeEvent).detail.state;
      const verified = state === "verified";
      onVerified(verified);
      setStatus(verified ? "Human verification complete." : state === "error" ? "Verification failed. Try again." : "Complete the privacy-safe check to continue.");
    };
    widget.addEventListener("statechange", handleState);
    return () => widget.removeEventListener("statechange", handleState);
  }, [onVerified]);

  return (
    <div className="altcha-gate" aria-label="Human verification">
      <altcha-widget
        ref={widgetRef}
        challengeurl={CHALLENGE_URL}
        name="altcha"
        auto="off"
        workers={2}
        hidefooter
        style={{
          "--altcha-color-base": "rgba(10, 14, 20, .92)",
          "--altcha-color-border": "rgba(255, 255, 255, .16)",
          "--altcha-color-text": "#f5f7fa",
          "--altcha-border-radius": "12px",
          "--altcha-max-width": "100%",
        }}
      />
      <small className="muted" role="status">{status} No tracking or image puzzles.</small>
    </div>
  );
}
