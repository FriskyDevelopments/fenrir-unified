import { useEffect, useState } from "react";
import { isBrandSyncSupported, subscribeBrandUpdates, type BrandUpdateKind } from "./brand-sync";

export interface BrandSyncStatus {
  /** True once this tab is subscribed to the shared brand channel. */
  listening: boolean;
  /** False when the browser has no BroadcastChannel (storage-event fallback). */
  crossTab: boolean;
  /** Kind of the most recent applied change, or null if none yet. */
  lastKind: BrandUpdateKind | null;
  /** Epoch ms of the most recent applied change. */
  lastAt: number | null;
  /** Human label such as "just now" / "3m ago". */
  lastLabel: string | null;
}

function relative(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

/**
 * Live view of the shared brand/theme channel for this tab: whether updates are
 * being received and when the last one was applied.
 */
export function useBrandSyncStatus(): BrandSyncStatus {
  const [listening, setListening] = useState(false);
  const [crossTab, setCrossTab] = useState(true);
  const [last, setLast] = useState<{ kind: BrandUpdateKind; at: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setCrossTab(isBrandSyncSupported());
    setListening(true);
    const unsubscribe = subscribeBrandUpdates((kind) => {
      setLast({ kind, at: Date.now() });
      setNow(Date.now());
    });
    return () => {
      setListening(false);
      unsubscribe();
    };
  }, []);

  // Keep the relative label fresh without re-rendering on every second.
  useEffect(() => {
    if (!last) return;
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [last]);

  return {
    listening,
    crossTab,
    lastKind: last?.kind ?? null,
    lastAt: last?.at ?? null,
    lastLabel: last ? relative(last.at, now) : null,
  };
}
