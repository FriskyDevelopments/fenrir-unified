/**
 * HowlMascot — wolf head howling silhouette against a moon, pure SVG,
 * theme-aware via --gate-* vars.
 * Ported from community-gate/frontend/src/components/HowlMascot.jsx.
 */
export function HowlMascot({ className = "", label = "HAUS · OF · HOWL" }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 480 540" className={className} data-testid="howl-mascot" aria-hidden>
      <defs>
        <radialGradient id="gate-howl-moon" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(var(--gate-accent) / 0.9)" />
          <stop offset="55%" stopColor="hsl(var(--gate-accent) / 0.32)" />
          <stop offset="100%" stopColor="hsl(var(--gate-accent) / 0)" />
        </radialGradient>
        <linearGradient id="gate-howl-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--gate-text) / 0.04)" />
          <stop offset="100%" stopColor="hsl(var(--gate-bg) / 0)" />
        </linearGradient>
      </defs>

      <circle cx="330" cy="150" r="110" fill="url(#gate-howl-moon)" className="anim-pulse-glow" />
      <circle cx="330" cy="150" r="82" fill="hsl(var(--gate-accent) / 0.16)" stroke="hsl(var(--gate-accent) / 0.5)" strokeWidth="1.5" />

      <g
        fill="url(#gate-howl-body)"
        stroke="hsl(var(--gate-accent))"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{
          filter:
            "drop-shadow(0 0 10px hsl(var(--gate-glow) / 0.5)) drop-shadow(0 0 26px hsl(var(--gate-glow) / 0.22))"
        }}
      >
        <path d="M 240 110 C 280 100, 320 130, 330 180 C 335 220, 320 260, 290 280 C 270 295, 248 300, 232 295" />
        <path d="M 232 295 L 140 200 L 120 150 L 60 95 L 70 75 L 130 130 L 170 165 L 240 230 Z" />
        <path d="M 120 150 L 60 95 L 80 130 L 145 195 Z" />
        <path d="M 248 110 L 240 60 L 270 95 Z" />
        <path d="M 285 110 L 285 64 L 312 110 Z" />
        <path d="M 320 270 L 350 380 L 340 460 L 270 460 L 270 320" />
      </g>

      <ellipse
        cx="282"
        cy="170"
        rx="6"
        ry="8"
        fill="hsl(var(--gate-accent))"
        className="anim-pulse-glow"
        style={{ filter: "drop-shadow(0 0 10px hsl(var(--gate-glow) / 0.95))" }}
      />

      <path d="M 252 100 L 256 78 L 264 96 Z" fill="hsl(var(--gate-bg))" stroke="hsl(var(--gate-accent))" strokeWidth="1.4" />
      <path d="M 292 100 L 296 80 L 304 100 Z" fill="hsl(var(--gate-bg))" stroke="hsl(var(--gate-accent))" strokeWidth="1.4" />
      <path d="M 92 132 L 65 100 L 78 138 Z" fill="hsl(var(--gate-bg))" stroke="hsl(var(--gate-accent))" strokeWidth="1.6" />

      <g stroke="hsl(var(--gate-accent) / 0.45)" strokeWidth="1.5" fill="none" strokeLinecap="round">
        <path d="M 38 88 Q 14 72 18 50" />
        <path d="M 26 110 Q -6 90 -2 60" />
        <path d="M 18 132 Q -20 110 -16 70" />
      </g>

      <text x="240" y="520" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="4" fill="hsl(var(--gate-text-muted))">
        {label}
      </text>
    </svg>
  );
}
