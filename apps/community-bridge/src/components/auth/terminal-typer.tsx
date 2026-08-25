import { useEffect, useMemo, useState } from "react";
import { useBrand } from "@/config/brand-context";
import { brandLoginCopy } from "@/config/brands";
import type { ProviderId } from "@/config/brands";

type Line = {
  prompt?: string;
  text: string;
  className?: string;
};

const CHAR_MS = 26;
const LINE_DELAY_MS = 260;

export function TerminalTyper({ providers }: { providers?: ProviderId[] | null }) {
  const brand = useBrand();
  const copy = brandLoginCopy(brand);

  const lines = useMemo<Line[]>(() => {
    const providerSignal =
      providers === null ? "checking..." : (providers ?? brand.providers).join(" · ") || "none";
    const providerLine = `providers: ${providerSignal}`;
    if (copy.terminalLines.length > 0) {
      return copy.terminalLines.map((text) => ({ text }));
    }
    return [
      { prompt: "➜", text: copy.terminalCommand, className: "text-foreground" },
      { text: "establishing secure channel...", className: "text-muted-foreground" },
      { text: `› ${providerLine}`, className: "text-indigo-300" },
      { text: "awaiting identity_", className: "text-muted-foreground" },
    ];
  }, [brand, copy, providers]);

  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done) return;
    const line = lines[lineIdx];
    if (!line) {
      setDone(true);
      return;
    }
    if (charIdx < line.text.length) {
      const t = setTimeout(() => setCharIdx((c) => c + 1), CHAR_MS);
      return () => clearTimeout(t);
    }
    if (lineIdx < lines.length - 1) {
      const t = setTimeout(() => {
        setLineIdx((i) => i + 1);
        setCharIdx(0);
      }, LINE_DELAY_MS);
      return () => clearTimeout(t);
    }
    setDone(true);
  }, [lineIdx, charIdx, done, lines]);

  return (
    <div
      className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/80 font-mono text-[13px] leading-relaxed shadow-2xl shadow-black/40 backdrop-blur-xl"
      aria-hidden="true"
    >
      <div className="flex items-center gap-1.5 border-b border-white/5 bg-white/5 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
        <span className="ml-2 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
          {copy.terminalHeader}
        </span>
      </div>
      <div className="space-y-1 px-5 py-4">
        {lines.map((line, i) => {
          if (i > lineIdx) return null;
          const visible = i === lineIdx ? line.text.slice(0, charIdx) : line.text;
          const showCursor = i === lineIdx && !done;
          return (
            <div key={i} className={line.className ?? "text-slate-200"}>
              {line.prompt ? <span className="mr-2 text-emerald-400">{line.prompt}</span> : null}
              <span>{visible}</span>
              {showCursor ? (
                <span className="ml-0.5 inline-block h-3.5 w-[3px] -mb-0.5 animate-pulse bg-indigo-400 align-middle" />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
