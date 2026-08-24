import { useEffect, useRef } from "react";

/**
 * Cosmic ground for the operator checkout.
 *
 * Fenrir is a wolf out of a night sky, so the substrate is a star field rather
 * than a gradient. Everything here is deliberately below the threshold that
 * competes for attention:
 *
 *  - Stars drift at ~4px per second and breathe on their own phase. Reason:
 *    a large dark field with zero movement reads as a dead screenshot; this
 *    gives it depth without ever pulling the eye off the price.
 *  - Parallax is driven by the pointer, not by a timer. Reason: motion that
 *    answers the operator feels like a surface; motion that loops on its own
 *    feels like a screensaver.
 *  - A comet crosses on a long random interval. Reason: it rewards the person
 *    who is still reading, and it is the only element allowed to be fast.
 *
 * Honours `prefers-reduced-motion`: renders one static frame and stops.
 * Pauses entirely when the tab is hidden.
 */

type Star = {
  x: number;
  y: number;
  z: number;
  r: number;
  phase: number;
  speed: number;
  hue: "ice" | "lime" | "violet";
};

type Comet = { x: number; y: number; vx: number; vy: number; life: number } | null;

const TINT = {
  ice: "236, 238, 255",
  lime: "183, 255, 42",
  violet: "139, 124, 255",
} as const;

export function CosmicField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let comet: Comet = null;
    let nextComet = 4000;
    let raf = 0;
    let last = performance.now();
    let running = true;

    // Pointer parallax, eased towards the target so it never snaps.
    let targetX = 0;
    let targetY = 0;
    let px = 0;
    let py = 0;

    function seed() {
      // Density scales with area so a phone does not render a desktop's worth
      // of stars.
      const count = Math.round(Math.min(200, Math.max(60, (width * height) / 11000)));
      stars = Array.from({ length: count }, () => {
        const roll = Math.random();
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          // Three depth planes drive both parallax strength and brightness.
          z: 0.35 + Math.random() * 0.65,
          r: 0.4 + Math.random() * 1.35,
          phase: Math.random() * Math.PI * 2,
          speed: 0.25 + Math.random() * 0.6,
          hue: roll > 0.94 ? "lime" : roll > 0.82 ? "violet" : "ice",
        } satisfies Star;
      });
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function drawNebula(t: number) {
      // Two very slow radial blooms. They rotate against each other so the
      // field never settles into a recognisable static shape.
      const a = reduced ? 0 : t * 0.00004;
      const clouds: Array<[number, number, number, string, number]> = [
        [
          width * (0.24 + Math.sin(a) * 0.05),
          height * (0.22 + Math.cos(a * 1.3) * 0.05),
          Math.max(width, height) * 0.55,
          TINT.violet,
          0.16,
        ],
        [
          width * (0.8 + Math.cos(a * 0.8) * 0.05),
          height * (0.78 + Math.sin(a) * 0.05),
          Math.max(width, height) * 0.45,
          TINT.lime,
          0.06,
        ],
      ];
      for (const [cx, cy, r, tint, alpha] of clouds) {
        const g = ctx!.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(${tint}, ${alpha})`);
        g.addColorStop(1, `rgba(${tint}, 0)`);
        ctx!.fillStyle = g;
        ctx!.fillRect(0, 0, width, height);
      }
    }

    function frame(now: number) {
      if (!running) return;
      const dt = Math.min(48, now - last);
      last = now;

      px += (targetX - px) * 0.06;
      py += (targetY - py) * 0.06;

      ctx!.clearRect(0, 0, width, height);
      drawNebula(now);

      for (const s of stars) {
        if (!reduced) {
          // Slow lateral drift; wrap rather than respawn so density is stable.
          s.x += (s.speed * s.z * dt) / 90;
          if (s.x > width + 4) s.x = -4;
          s.phase += dt / 900;
        }
        const twinkle = reduced ? 0.7 : 0.55 + Math.sin(s.phase) * 0.45;
        const ox = px * s.z * 18;
        const oy = py * s.z * 18;
        ctx!.beginPath();
        ctx!.arc(s.x + ox, s.y + oy, s.r * s.z, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${TINT[s.hue]}, ${(0.22 + s.z * 0.5) * twinkle})`;
        ctx!.fill();
      }

      if (!reduced) {
        nextComet -= dt;
        if (!comet && nextComet <= 0) {
          const fromTop = Math.random() > 0.5;
          comet = {
            x: fromTop ? Math.random() * width * 0.5 : -40,
            y: fromTop ? -20 : Math.random() * height * 0.5,
            vx: 0.42 + Math.random() * 0.22,
            vy: 0.2 + Math.random() * 0.14,
            life: 1,
          };
          // Long, irregular gap: a comet on a metronome would read as a loop.
          nextComet = 9000 + Math.random() * 11000;
        }
        if (comet) {
          comet.x += comet.vx * dt;
          comet.y += comet.vy * dt;
          comet.life -= dt / 1500;
          const tailX = comet.x - comet.vx * 150;
          const tailY = comet.y - comet.vy * 150;
          const g = ctx!.createLinearGradient(tailX, tailY, comet.x, comet.y);
          g.addColorStop(0, "rgba(183, 255, 42, 0)");
          g.addColorStop(1, `rgba(236, 238, 255, ${Math.max(0, comet.life) * 0.65})`);
          ctx!.strokeStyle = g;
          ctx!.lineWidth = 1.4;
          ctx!.beginPath();
          ctx!.moveTo(tailX, tailY);
          ctx!.lineTo(comet.x, comet.y);
          ctx!.stroke();
          if (comet.life <= 0 || comet.x > width + 200 || comet.y > height + 200) comet = null;
        }
      }

      if (!reduced) raf = requestAnimationFrame(frame);
    }

    function onPointer(event: PointerEvent) {
      targetX = (event.clientX / window.innerWidth) * 2 - 1;
      targetY = (event.clientY / window.innerHeight) * 2 - 1;
    }

    function onVisibility() {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduced) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }

    const observer = new ResizeObserver(() => resize());
    observer.observe(canvas);
    resize();

    if (reduced) {
      frame(performance.now());
    } else {
      window.addEventListener("pointermove", onPointer, { passive: true });
      document.addEventListener("visibilitychange", onVisibility);
      raf = requestAnimationFrame(frame);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
