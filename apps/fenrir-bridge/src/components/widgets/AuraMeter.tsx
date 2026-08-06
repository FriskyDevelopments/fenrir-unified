import { useEffect, useState } from "react";
import "./widgets.css";

type AuraMeterProps = {
  /** 0–100 */
  value: number;
  label?: string;
  size?: number;
  className?: string;
};

/**
 * Circular aura gauge: neon gradient arc, orbiting scan dot,
 * tabular value readout. Pure SVG — no canvas, no deps.
 */
export function AuraMeter({ value, label = "Aura", size = 148, className = "" }: AuraMeterProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const [display, setDisplay] = useState(0);

  // count-up readout following the arc animation
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplay(Math.round(clamped));
      return;
    }
    let raf = 0;
    const from = display;
    const start = performance.now();
    const dur = 650;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (clamped - from) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped]);

  const r = 62;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);

  return (
    <div
      className={`lw lw-meter ${className}`.trim()}
      style={{ width: size, height: size }}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
    >
      <svg width={size} height={size} viewBox="0 0 148 148">
        <defs>
          <linearGradient id="lw-meter-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--lw-primary, #FF2E6E)" />
            <stop offset="55%" stopColor="var(--lw-accent, #9D00FF)" />
            <stop offset="100%" stopColor="var(--lw-secondary, #00E5FF)" />
          </linearGradient>
          <filter id="lw-meter-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* track */}
        <circle cx="74" cy="74" r={r} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="8" />
        {/* ticks */}
        {Array.from({ length: 24 }, (_, i) => {
          const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
          const x1 = 74 + Math.cos(a) * (r - 11);
          const y1 = 74 + Math.sin(a) * (r - 11);
          const x2 = 74 + Math.cos(a) * (r - 15);
          const y2 = 74 + Math.sin(a) * (r - 15);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(255,255,255,.18)"
              strokeWidth="1.5"
            />
          );
        })}
        {/* value arc */}
        <circle
          className="lw-meter__arc"
          cx="74"
          cy="74"
          r={r}
          fill="none"
          stroke="url(#lw-meter-grad)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 74 74)"
          filter="url(#lw-meter-glow)"
        />
        {/* orbiting scan dot */}
        <g className="lw-meter__scan">
          <circle cx="74" cy={74 - r} r="3" fill="var(--lw-secondary, #00E5FF)">
            <animate attributeName="opacity" values="1;.3;1" dur="1.3s" repeatCount="indefinite" />
          </circle>
        </g>
      </svg>
      <span className="lw-meter__value">{display}</span>
      <span className="lw-meter__label">{label}</span>
    </div>
  );
}
