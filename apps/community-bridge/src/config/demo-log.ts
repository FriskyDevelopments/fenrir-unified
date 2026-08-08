/**
 * Demo activity log — a client-only, in-memory (session-persisted) trail of the
 * mock auth/session and navigation events that happen while demo mode is on.
 * Nothing here touches the backend; it exists so a reviewer can see exactly
 * which simulated action fired and when.
 */

export type DemoEventKind = "auth" | "session" | "nav" | "link";

export interface DemoEvent {
  id: string;
  kind: DemoEventKind;
  message: string;
  detail?: string;
  at: number;
}

const STORE_KEY = "fenrir_demo_log";
const MAX = 60;

let events: DemoEvent[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    if (raw) events = JSON.parse(raw) as DemoEvent[];
  } catch {
    events = [];
  }
}

function persist() {
  try {
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify(events));
  } catch {
    /* storage unavailable — the log stays in memory only */
  }
}

function emit() {
  for (const l of listeners) l();
}

/** Record a simulated action. No-op outside the browser. */
export function logDemoEvent(kind: DemoEventKind, message: string, detail?: string): void {
  if (typeof window === "undefined") return;
  hydrate();
  const last = events[0];
  // Collapse duplicate consecutive entries (e.g. repeated route notifications).
  if (last && last.kind === kind && last.message === message && last.detail === detail) return;
  events = [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind, message, detail, at: Date.now() }, ...events].slice(
    0,
    MAX,
  );
  persist();
  emit();
}

export function getDemoEvents(): DemoEvent[] {
  hydrate();
  return events;
}

export function clearDemoEvents(): void {
  events = [];
  persist();
  emit();
}

export function subscribeDemoEvents(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** "just now" / "12s ago" / "4m ago" */
export function formatDemoTime(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 3) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function formatClock(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
