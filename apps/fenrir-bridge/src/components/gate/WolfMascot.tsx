/**
 * Stylised wolf silhouette mascot — pure SVG, theme-aware via --gate-* vars.
 * Ported from community-gate/frontend/src/components/WolfMascot.jsx.
 */
export function WolfMascot({ className = "", label = "FENRIR · PROTOCOL" }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 400 460" className={className} data-testid="wolf-mascot" aria-hidden>
      <defs>
        <linearGradient id="gate-wolf-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--gate-text) / 0.04)" />
          <stop offset="100%" stopColor="hsl(var(--gate-bg) / 0)" />
        </linearGradient>
        <radialGradient id="gate-wolf-eye" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(var(--gate-accent) / 1)" />
          <stop offset="60%" stopColor="hsl(var(--gate-accent) / 0.5)" />
          <stop offset="100%" stopColor="hsl(var(--gate-accent) / 0)" />
        </radialGradient>
      </defs>

      <path
        d="M200 30
           C 235 60, 270 70, 300 110
           C 330 150, 340 200, 330 240
           C 360 250, 380 290, 360 330
           C 340 370, 290 380, 260 360
           C 250 410, 210 440, 170 430
           C 140 425, 120 405, 110 380
           C 80 380, 55 360, 50 330
           C 40 290, 60 260, 90 250
           C 70 210, 80 160, 110 120
           C 140 80, 170 60, 200 30 Z"
        fill="url(#gate-wolf-body)"
        stroke="hsl(var(--gate-accent) / 0.45)"
        strokeWidth="1.2"
      />

      <path d="M155 90 L 175 50 L 190 95 Z" fill="hsl(var(--gate-bg) / 0.9)" stroke="hsl(var(--gate-accent) / 0.35)" strokeWidth="0.8" />
      <path d="M245 95 L 230 50 L 215 95 Z" fill="hsl(var(--gate-bg) / 0.9)" stroke="hsl(var(--gate-accent) / 0.35)" strokeWidth="0.8" />

      <g className="anim-pulse-glow glow-eye">
        <circle cx="160" cy="180" r="11" fill="url(#gate-wolf-eye)" />
        <circle cx="240" cy="180" r="11" fill="url(#gate-wolf-eye)" />
        <circle cx="160" cy="180" r="3.6" fill="hsl(var(--gate-accent))" />
        <circle cx="240" cy="180" r="3.6" fill="hsl(var(--gate-accent))" />
      </g>

      <path d="M180 240 Q 200 260 220 240" stroke="hsl(var(--gate-accent) / 0.5)" strokeWidth="1" fill="none" />
      <path d="M200 225 L 200 248" stroke="hsl(var(--gate-accent) / 0.4)" strokeWidth="0.8" />

      <text
        x="200"
        y="395"
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
        fontSize="9"
        letterSpacing="4"
        fill="hsl(var(--gate-text-muted))"
      >
        {label}
      </text>
    </svg>
  );
}
