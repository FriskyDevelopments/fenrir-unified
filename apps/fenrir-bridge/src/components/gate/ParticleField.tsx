import { useEffect, useRef } from "react";

type Particle = { x: number; y: number; vx: number; vy: number; r: number; a: number };

/**
 * Lightweight canvas particle field, theme-aware via --gate-accent.
 * Ported from community-gate/frontend/src/components/ParticleField.jsx.
 */
export function ParticleField({ density = 38, speed = 0.18 }: { density?: number; speed?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let particles: Particle[] = [];

    const getColor = () => {
      const accent = getComputedStyle(document.documentElement)
        .getPropertyValue("--gate-accent")
        .trim() || "40 42% 59%";
      return `hsl(${accent})`;
    };

    function spawn(): Particle {
      return {
        x: Math.random() * canvas!.offsetWidth,
        y: Math.random() * canvas!.offsetHeight,
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed,
        r: Math.random() * 1.6 + 0.4,
        a: Math.random() * 0.5 + 0.15
      };
    }

    function resize() {
      if (!canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = new Array(density).fill(0).map(() => spawn());
    }

    function step() {
      if (!canvas || !ctx) return;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);
      const color = getColor();
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j]!;
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const d = Math.hypot(dx, dy);
          if (d < 120) {
            ctx.strokeStyle = color;
            ctx.globalAlpha = (1 - d / 120) * 0.12;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
        ctx.fillStyle = color;
        ctx.globalAlpha = p.a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(step);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    step();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [density, speed]);

  return <canvas ref={ref} className="gate-fill" data-testid="particle-field" />;
}
