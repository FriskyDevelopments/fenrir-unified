import { useEffect, useMemo, useRef, useState } from "react";
import "./human-verification.css";

const verifierOrigin = "https://friskydev-human-verification.hrgrrtks2p.workers.dev";
const passCookieName = "fenrir_human_verified";
const passTtlSeconds = 15 * 60;

function passCookieDomainAttr() {
  const host = window.location.hostname;
  return host === "myfenrir.com" || host.endsWith(".myfenrir.com") ? "; Domain=.myfenrir.com" : "";
}

function hasVerificationPass() {
  return document.cookie.split(";").some((entry) => entry.trim().startsWith(`${passCookieName}=1`));
}

function persistVerificationPass() {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${passCookieName}=1; Max-Age=${passTtlSeconds}; Path=/; SameSite=Lax${secure}${passCookieDomainAttr()}`;
}

type VerificationMessage = {
  type?: string;
  verified?: boolean;
  grant?: string;
  context?: string;
  height?: number;
};

/** Embeds the canonical Frisky Slider / Frisky Runes verifier. */
export function HumanVerificationGate({ onVerified }: { onVerified: (verified: boolean) => void }) {
  const context = useMemo(() => crypto.randomUUID().replaceAll("-", ""), []);
  const [height, setHeight] = useState(510);
  const [verified, setVerified] = useState<boolean>(() => hasVerificationPass());
  const [note, setNote] = useState<string | null>(null);
  const notifiedRef = useRef(false);
  const source = `${verifierOrigin}/?${new URLSearchParams({
    audience: window.location.origin,
    context,
    embed: "miniapp",
  }).toString()}`;

  const markVerified = (persist: boolean) => {
    if (persist) persistVerificationPass();
    setVerified(true);
    setNote(null);
    if (!notifiedRef.current) {
      notifiedRef.current = true;
      onVerified(true);
    }
  };

  useEffect(() => {
    if (hasVerificationPass()) markVerified(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const receive = async (event: MessageEvent<VerificationMessage>) => {
      if (event.origin !== verifierOrigin || event.data?.context !== context) return;
      if (event.data.type === "friskydev-human-verification-resize" && Number.isFinite(event.data.height)) {
        setHeight(Math.max(360, Math.min(680, Number(event.data.height))));
        return;
      }
      if (event.data.type !== "friskydev-human-verification" || !event.data.verified || !event.data.grant) return;
      setNote("Confirming signed verification…");
      const response = await fetch("/api/verification/grant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant: event.data.grant, context }),
      }).catch(() => null);
      if (!response?.ok) {
        setNote("The signed verification could not be confirmed. Please retry.");
        return;
      }
      markVerified(true);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, onVerified]);

  return (
    <section className={`canonical-verification ${verified ? "is-verified" : ""}`} aria-label="Frisky human verification">
      {verified ? <div className="verification-success"><span>✓</span>Verified. You may continue.</div> : (
        <iframe title="Frisky human verification" src={source} style={{ height }} referrerPolicy="no-referrer" />
      )}
      {note ? <p className="canonical-verification__note" role="status">{note}</p> : null}
    </section>
  );
}
