import "altcha";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./human-verification.css";

type Mode = "altcha" | "slider" | "puzzle";
type Challenge = { token: string; risk: string; target?: number; sequence?: string[]; choices?: string[] };

const copy = {
  title: "Face verification",
  intro: "Confirm the living signal. No tracking, no image recognition.",
  checking: "Preparing the face-signal check…",
  slider: "Signal Slider",
  sliderInstruction: "Move the wolf to the luminous lock.",
  puzzle: "Rune sequence",
  puzzleInstruction: "Repeat the signal in the same order.",
  altcha: "Use automatic verification",
  verified: "Signal verified. Continue to MyFenrir.",
  failed: "That signal did not match. Try the next method.",
};

/**
 * The primary challenge is the in-product Face Verification experience.
 * ALTCHA is deliberately last-resort only: it must never be the first thing
 * a member sees on the MyFenrir login surface.
 */
export function AltchaGate({ onVerified }: { onVerified: (verified: boolean) => void }) {
  const widgetRef = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<Mode>("puzzle");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [slider, setSlider] = useState(0);
  const [answer, setAnswer] = useState<string[]>([]);
  const [note, setNote] = useState(copy.checking);
  const [verified, setVerified] = useState(false);

  async function submit(current: Mode, payload: Record<string, unknown>) {
    const response = await fetch("/api/verification/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: current, ...payload }),
    });
    const body = await response.json().catch(() => null) as { grant?: string } | null;
    if (!response.ok || !body?.grant) throw new Error("verification_failed");
    setVerified(true);
    setNote(copy.verified);
    onVerified(true);
  }

  async function loadChallenge(next: "slider" | "puzzle") {
    setMode(next);
    setChallenge(null);
    setAnswer([]);
    setSlider(0);
    setNote(next === "puzzle" ? copy.intro : copy.sliderInstruction);
    try {
      const response = await fetch(`/api/verification/challenge?mode=${next}`, { cache: "no-store" });
      if (!response.ok) throw new Error("challenge_unavailable");
      setChallenge(await response.json() as Challenge);
    } catch {
      setNote(copy.failed);
    }
  }

  // Start with the repository's custom Face Verification challenge, not ALTCHA.
  useEffect(() => { void loadChallenge("puzzle"); }, []);

  useEffect(() => {
    if (mode !== "altcha" || !widgetRef.current) return;
    const widget = widgetRef.current;
    const state = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: string; payload?: string }>).detail;
      if (detail?.payload) void submit("altcha", { payload: detail.payload }).catch(() => { setNote(copy.failed); void loadChallenge("slider"); });
      else if (detail?.state === "error") { setNote(copy.failed); void loadChallenge("slider"); }
    };
    widget.addEventListener("statechange", state);
    widget.addEventListener("verified", state);
    return () => { widget.removeEventListener("statechange", state); widget.removeEventListener("verified", state); };
  }, [mode]);

  async function submitSlider() {
    if (!challenge) return;
    try { await submit("slider", { token: challenge.token, value: slider }); }
    catch { setNote(copy.failed); void loadChallenge("puzzle"); }
  }

  async function chooseRune(rune: string) {
    if (!challenge?.sequence) return;
    const next = [...answer, rune].slice(0, challenge.sequence.length);
    setAnswer(next);
    if (next.length === challenge.sequence.length) {
      try { await submit("puzzle", { token: challenge.token, answer: next }); }
      catch { setAnswer([]); setNote(copy.failed); void loadChallenge("slider"); }
    }
  }

  const style = { "--hv": "#00e5ff" } as CSSProperties;
  return <section className={`human-verification human-verification--fenrir ${verified ? "is-verified" : ""}`} style={style} aria-label={copy.title}>
    <header>
      <img src="/fenrir-splash-icon.svg?v=20260813-face-verification" alt="" />
      <div><b>{copy.title}</b><small>{note}</small></div>
      <span>{challenge?.risk || "adaptive"}</span>
    </header>

    {!verified && mode === "puzzle" && challenge?.sequence ? <div className="rune-puzzle">
      <p className="verification-method">FACE SIGNAL · ORDER MATTERS</p>
      <div className="rune-sequence">{challenge.sequence.map((rune, i) => <span key={`${rune}-${i}`}>{rune}</span>)}</div>
      <div className="rune-answer">{challenge.sequence.map((_, i) => <span key={i}>{answer[i] || "·"}</span>)}</div>
      <div className="rune-choices">{challenge.choices?.map((rune) => <button type="button" key={rune} onClick={() => void chooseRune(rune)}>{rune}</button>)}</div>
      <div className="verification-switches"><button type="button" onClick={() => void loadChallenge("slider")}>{copy.slider}</button><button type="button" onClick={() => { setMode("altcha"); setNote("Automatic verification is available if needed."); }}>{copy.altcha}</button></div>
    </div> : null}

    {!verified && mode === "slider" && challenge?.target != null ? <div className="wolf-slider">
      <b className="signal-slider__name">{copy.slider}</b>
      <p className="verification-method">{copy.sliderInstruction}</p>
      <div className="wolf-slider__track"><i style={{ left: `${challenge.target}%` }} /><span style={{ width: `${slider}%` }} /></div>
      <label><span className="sr-only">{copy.sliderInstruction}</span><input type="range" min="0" max="100" value={slider} onChange={(event) => setSlider(Number(event.target.value))} onPointerUp={() => void submitSlider()} onKeyUp={(event) => { if (event.key === "Enter") void submitSlider(); }} /></label>
      <div className="verification-switches"><button type="button" onClick={() => void loadChallenge("puzzle")}>{copy.puzzle}</button><button type="button" onClick={() => { setMode("altcha"); setNote("Automatic verification is available if needed."); }}>{copy.altcha}</button></div>
    </div> : null}

    {!verified && mode === "altcha" ? <div className="altcha-shell"><altcha-widget ref={widgetRef as never} challengeurl="/api/verification/challenge?mode=altcha" hidefooter hidelogo {...({ configuration: '{"hideFooter":true,"hideLogo":true}' } as Record<string, string>)} /></div> : null}
    {verified ? <div className="verification-success"><span>✓</span>{copy.verified}</div> : null}
  </section>;
}
