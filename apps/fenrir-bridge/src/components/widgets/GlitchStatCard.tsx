import { useEffect, useRef, useState } from "react";
import "./widgets.css";

type GlitchStatCardProps = {
  kicker: string;
  value: number;
  /** e.g. "+12.4% vs last week" */
  delta?: string;
  deltaDirection?: "up" | "down" | "flat";
  format?: (n: number) => string;
  className?: string;
};

const defaultFormat = (n: number) => n.toLocaleString();

/**
 * Glass stat card with CRT scanlines, a hover light-beam sweep,
 * and a scramble-then-settle count-up when the value changes.
 */
export function GlitchStatCard({
  kicker,
  value,
  delta,
  deltaDirection = "flat",
  format = defaultFormat,
  className = ""
}: GlitchStatCardProps) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || prev.current === value) {
      prev.current = value;
      setDisplay(value);
      return;
    }
    let raf = 0;
    const from = prev.current;
    prev.current = value;
    const start = performance.now();
    const dur = 800;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 4);
      // scramble jitter early, settle late
      const jitter = t < 0.6 ? (Math.random() - 0.5) * (1 - t) * Math.abs(value - from) * 0.2 : 0;
      setDisplay(Math.round(from + (value - from) * eased + jitter));
      if (t < 1) raf = requestAnimationFrame(step);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <div className={`lw lw-stat ${className}`.trim()}>
      <span className="lw-stat__beam" aria-hidden="true" />
      <div className="lw-stat__kicker">{kicker}</div>
      <div className="lw-stat__value" aria-live="polite">
        {format(display)}
      </div>
      {delta ? (
        <span className="lw-stat__delta" data-dir={deltaDirection}>
          {deltaDirection === "up" ? "▲ " : deltaDirection === "down" ? "▼ " : ""}
          {delta}
        </span>
      ) : null}
      <span className="lw-stat__scanlines" aria-hidden="true" />
    </div>
  );
}
