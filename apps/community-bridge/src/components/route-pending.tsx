export function RoutePending() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#050909]"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:38px_38px] [mask-image:radial-gradient(circle_at_center,black,transparent_72%)]"
      />
      <div
        aria-hidden="true"
        className="absolute h-64 w-64 rounded-full border border-primary/20 motion-safe:animate-pulse"
      >
        <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_22px_hsl(var(--primary))]" />
        <span className="absolute inset-9 rounded-full border border-dashed border-emerald-400/15" />
      </div>
      <div className="relative flex w-64 flex-col items-center text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-xl shadow-[0_0_50px_hsl(var(--primary)/0.18)]">
          🐺
        </span>
        <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/80">
          Fenrir Community Bridge
        </p>
        <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.2em] text-white/30">
          Opening secure route
        </p>
        <div className="mt-7 h-px w-full overflow-hidden bg-white/10">
          <span className="block h-full w-full origin-left bg-gradient-to-r from-transparent via-primary to-emerald-300 motion-safe:animate-pulse" />
        </div>
        <span className="sr-only">Loading MyFenrir</span>
      </div>
    </div>
  );
}
