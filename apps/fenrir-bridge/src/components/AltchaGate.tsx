import "altcha";
import { useEffect, useRef, useState, type CSSProperties } from "react";

type Mode = "altcha" | "slider" | "puzzle";
type Challenge = { token: string; risk: string; target?: number; sequence?: string[]; choices?: string[] };

const panel: CSSProperties = { margin: "16px 0", padding: 14, border: "1px solid rgba(194,164,105,.42)", borderRadius: 16, background: "rgba(7,11,18,.82)", textAlign: "left" };
const action: CSSProperties = { background: "transparent", border: 0, color: "#c2a469", textDecoration: "underline", padding: 0, minHeight: 0, fontSize: 12, boxShadow: "none" };

export function AltchaGate({ onVerified }: { onVerified: (verified: boolean) => void }) {
  const widgetRef = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<Mode>("altcha");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [slider, setSlider] = useState(0);
  const [answer, setAnswer] = useState<string[]>([]);
  const [note, setNote] = useState("Preparing secure verification…");
  const [verified, setVerified] = useState(false);

  async function submit(current: Mode, payload: Record<string, unknown>) {
    const response = await fetch("/api/verification/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: current, ...payload }) });
    const body = await response.json().catch(() => null) as { grant?: string } | null;
    if (!response.ok || !body?.grant) throw new Error("verification_failed");
    setVerified(true); setNote("Human signal verified."); onVerified(true);
  }

  async function fallback(next: "slider" | "puzzle") {
    setMode(next); setChallenge(null); setAnswer([]); setSlider(0); setNote("Preparing secure verification…");
    try {
      const response = await fetch(`/api/verification/challenge?mode=${next}`, { cache: "no-store" });
      if (!response.ok) throw new Error("challenge_unavailable");
      const body = await response.json() as Challenge;
      setChallenge(body);
      setNote(next === "slider" ? "Slide the wolf to the signal lock." : "Tap the rune sequence in order.");
    } catch { setNote("Verification failed. Try again."); }
  }

  useEffect(() => {
    if (mode !== "altcha" || !widgetRef.current) return;
    const widget = widgetRef.current;
    const state = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: string; payload?: string }>).detail;
      if (detail?.payload) void submit("altcha", { payload: detail.payload }).catch(() => void fallback("slider"));
      else if (detail?.state === "error") void fallback("slider");
    };
    widget.addEventListener("statechange", state);
    widget.addEventListener("verified", state);
    const timer = window.setTimeout(() => void fallback("slider"), 8000);
    return () => { window.clearTimeout(timer); widget.removeEventListener("statechange", state); widget.removeEventListener("verified", state); };
  }, [mode]);

  async function submitSlider() {
    if (!challenge) return;
    try { await submit("slider", { token: challenge.token, value: slider }); }
    catch { setNote("That signal did not match. Try again."); }
  }

  async function chooseRune(rune: string) {
    if (!challenge?.sequence) return;
    const next = [...answer, rune].slice(0, challenge.sequence.length);
    setAnswer(next);
    if (next.length === challenge.sequence.length) {
      try { await submit("puzzle", { token: challenge.token, answer: next }); }
      catch { setAnswer([]); setNote("That signal did not match. Try again."); }
    }
  }

  return <section style={panel} aria-label="Human verification">
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <img src="/fenrir-splash-icon.svg?v=20260813-login" width="30" height="30" alt="" />
      <div style={{ flex: 1 }}><b style={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase" }}>Human signal</b><small style={{ display: "block", color: "#b7c2cb", marginTop: 2 }}>{note}</small></div>
      <small style={{ color: "#c2a469", textTransform: "uppercase" }}>{challenge?.risk || "adaptive"}</small>
    </div>
    {!verified && mode === "altcha" ? <altcha-widget ref={widgetRef as never} challengeurl="/api/verification/challenge?mode=altcha" hidefooter hidelogo {...({ configuration: '{"hideFooter":true,"hideLogo":true}' } as any)} /> : null}
    {!verified && mode === "slider" && challenge?.target != null ? <div>
      <b style={{ display: "block", fontSize: 12, marginBottom: 8 }}>Wolf Slider</b>
      <div style={{ position: "relative", height: 10, borderRadius: 10, background: "#1b2430" }}><i style={{ position: "absolute", left: `${challenge.target}%`, top: -5, width: 3, height: 20, background: "#c2a469" }} /><span style={{ display: "block", width: `${slider}%`, height: "100%", borderRadius: 10, background: "linear-gradient(90deg,#7b2fff,#c2a469)" }} /></div>
      <input aria-label="Slide the wolf to the signal lock" type="range" min="0" max="100" value={slider} onChange={(e) => setSlider(Number(e.target.value))} onPointerUp={() => void submitSlider()} onKeyUp={(e) => { if (e.key === "Enter") void submitSlider(); }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}><button type="button" style={action} onClick={() => void fallback("puzzle")}>Use rune puzzle</button><button type="button" style={action} onClick={() => setMode("altcha")}>Try ALTCHA again</button></div>
    </div> : null}
    {!verified && mode === "puzzle" && challenge?.sequence ? <div>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, margin: "10px 0" }}>{challenge.sequence.map((_, index) => <span key={index} style={{ width: 38, height: 38, display: "grid", placeItems: "center", border: "1px solid #725f3e", borderRadius: 9 }}>{answer[index] || "·"}</span>)}</div>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>{challenge.choices?.map((rune) => <button type="button" key={rune} onClick={() => void chooseRune(rune)}>{rune}</button>)}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}><button type="button" style={action} onClick={() => setAnswer([])}>Reset</button><button type="button" style={action} onClick={() => void fallback("slider")}>Wolf Slider</button></div>
    </div> : null}
    {verified ? <div style={{ color: "#96ffe1", fontSize: 13 }}>✓ Human signal verified</div> : null}
  </section>;
}
