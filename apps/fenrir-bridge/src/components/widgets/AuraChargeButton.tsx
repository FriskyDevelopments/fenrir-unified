import { useCallback, useEffect, useRef, useState } from "react";
import "./widgets.css";

const BURST_COLORS = ["#FF2E6E", "#9D00FF", "#00E5FF", "#FFB020", "#5CF08A"];

type Particle = { id: number; dx: number; dy: number; color: string; size: number };

type AuraChargeButtonProps = {
  /** Initial like count */
  count?: number;
  /** Called with the increment (1–5) when a charged like is released */
  onLike?: (increment: number) => void;
  label?: string;
  className?: string;
};

/**
 * Hold-to-charge "mega-wow" like button.
 * Tap = +1. Hold to charge up to +5; release fires a particle burst
 * proportional to the charge. Keyboard: Space/Enter hold-and-release works too.
 */
export function AuraChargeButton({
  count: initialCount = 0,
  onLike,
  label = "Like",
  className = ""
}: AuraChargeButtonProps) {
  const [count, setCount] = useState(initialCount);
  const [charge, setCharge] = useState(0);
  const [charging, setCharging] = useState(false);
  const [squash, setSquash] = useState(1);
  const [particles, setParticles] = useState<Particle[]>([]);
  const raf = useRef<number | undefined>(undefined);
  const startTs = useRef(0);
  const particleId = useRef(0);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => cancelAnimationFrame(raf.current ?? 0);
  }, []);

  const beginCharge = useCallback(() => {
    if (charging) return;
    setCharging(true);
    setSquash(0.94);
    startTs.current = performance.now();
    const tick = (now: number) => {
      const pct = Math.min(100, ((now - startTs.current) / 1200) * 100);
      setCharge(pct);
      if (pct < 100) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [charging]);

  const releaseCharge = useCallback(() => {
    if (!charging) return;
    cancelAnimationFrame(raf.current ?? 0);
    const increment = Math.max(1, Math.round((charge / 100) * 5));
    setCount((c) => c + increment);
    onLike?.(increment);
    setCharging(false);
    setSquash(1.08);
    window.setTimeout(() => setSquash(1), 160);

    if (!reducedMotion.current) {
      const n = 6 + increment * 4;
      const burst: Particle[] = Array.from({ length: n }, (_, i) => {
        const angle = (i / n) * Math.PI * 2 + Math.random() * 0.5;
        const dist = 36 + Math.random() * 40 * (increment / 2);
        return {
          id: particleId.current++,
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist,
          color: BURST_COLORS[i % BURST_COLORS.length],
          size: 4 + Math.random() * 5
        };
      });
      setParticles((p) => [...p, ...burst]);
      window.setTimeout(
        () => setParticles((p) => p.filter((x) => !burst.some((b) => b.id === x.id))),
        750
      );
    }
    setCharge(0);
  }, [charging, charge, onLike]);

  return (
    <button
      type="button"
      className={`lw lw-charge ${className}`.trim()}
      data-charging={charging}
      style={
        {
          "--lw-charge": charge,
          "--lw-squash": squash
        } as React.CSSProperties
      }
      aria-label={`${label} — hold to charge, currently ${count}`}
      onPointerDown={beginCharge}
      onPointerUp={releaseCharge}
      onPointerLeave={releaseCharge}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          beginCharge();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          releaseCharge();
        }
      }}
    >
      <span className="lw-charge__ring" aria-hidden="true" />
      <svg className="lw-charge__heart" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21s-7.5-4.9-10-9.6C.4 8.2 2.4 4.5 6 4.5c2.1 0 3.6 1.1 4.5 2.7h3c.9-1.6 2.4-2.7 4.5-2.7 3.6 0 5.6 3.7 4 6.9C19.5 16.1 12 21 12 21z" />
      </svg>
      <span>{label}</span>
      <span className="lw-charge__count" aria-live="polite">
        {count}
      </span>
      {particles.map((p) => (
        <span
          key={p.id}
          className="lw-charge__particle"
          style={
            {
              background: p.color,
              width: p.size,
              height: p.size,
              boxShadow: `0 0 8px ${p.color}`,
              "--lw-dx": `${p.dx}px`,
              "--lw-dy": `${p.dy}px`
            } as React.CSSProperties
          }
          aria-hidden="true"
        />
      ))}
    </button>
  );
}
