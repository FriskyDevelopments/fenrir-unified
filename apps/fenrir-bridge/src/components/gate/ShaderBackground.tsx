import { useEffect, useRef } from "react";

export type ShaderKind = "shader" | "clouds" | "grid" | "ember" | "noise";

/**
 * Atmospheric shader-like background using layered radial gradients animated
 * on canvas. Theme-aware via the --gate-* HSL tokens.
 * Ported from community-gate/frontend/src/components/ShaderBackground.jsx.
 */
export function ShaderBackground({ kind = "shader" }: { kind?: ShaderKind }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let t = 0;

    const cs = () => getComputedStyle(document.documentElement);
    const hsl = (name: string, alpha = 1) => {
      const v = cs().getPropertyValue(name).trim() || "0 0% 0%";
      return `hsl(${v} / ${alpha})`;
    };

    function resize() {
      if (!canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function blob(x: number, y: number, r: number, color: string) {
      if (!canvas || !ctx) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
    }

    function frame() {
      if (!canvas || !ctx) return;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.fillStyle = hsl("--gate-bg", 1);
      ctx.fillRect(0, 0, w, h);

      t += 0.0035;
      const accent = (a: number) => hsl("--gate-accent", a);
      const soft = (a: number) => hsl("--gate-accent-soft", a);
      const glow = (a: number) => hsl("--gate-glow", a);

      if (kind === "clouds") {
        blob(w * (0.25 + 0.08 * Math.sin(t)), h * (0.3 + 0.06 * Math.cos(t * 1.1)), Math.max(w, h) * 0.55, soft(0.18));
        blob(w * (0.7 + 0.06 * Math.cos(t * 0.9)), h * (0.7 + 0.05 * Math.sin(t * 1.2)), Math.max(w, h) * 0.55, accent(0.13));
        blob(w * 0.5, h * 0.5, Math.max(w, h) * 0.4, glow(0.06));
      } else if (kind === "grid") {
        blob(w * (0.1 + 0.05 * Math.sin(t)), h * 0.4, Math.max(w, h) * 0.5, accent(0.18));
        blob(w * 0.9, h * 0.6, Math.max(w, h) * 0.5, soft(0.18));
        ctx.save();
        ctx.strokeStyle = hsl("--gate-accent", 0.06);
        ctx.lineWidth = 1;
        const step = 60;
        ctx.beginPath();
        for (let x = 0; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
        for (let y = 0; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
        ctx.stroke();
        ctx.restore();
      } else if (kind === "ember") {
        blob(w * (0.3 + 0.06 * Math.sin(t)), h * (0.8 + 0.04 * Math.cos(t)), Math.max(w, h) * 0.55, accent(0.22));
        blob(w * 0.8, h * 0.2, Math.max(w, h) * 0.45, soft(0.14));
      } else if (kind === "noise") {
        blob(w * 0.5, h * 0.5, Math.max(w, h) * 0.6, accent(0.04));
      } else {
        blob(w * (0.2 + 0.06 * Math.sin(t)), h * (0.3 + 0.05 * Math.cos(t * 1.3)), Math.max(w, h) * 0.5, accent(0.22));
        blob(w * (0.8 + 0.05 * Math.cos(t)), h * (0.75 + 0.05 * Math.sin(t)), Math.max(w, h) * 0.5, soft(0.16));
        blob(w * 0.5, h * 0.5, Math.max(w, h) * 0.35, glow(0.06));
      }

      raf = requestAnimationFrame(frame);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    frame();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [kind]);

  return <canvas ref={ref} className="gate-fill" data-testid="shader-background" />;
}
