import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { isDemoMode } from "@/config/demo-mode";
import {
  clearDemoEvents,
  formatClock,
  formatDemoTime,
  getDemoEvents,
  logDemoEvent,
  subscribeDemoEvents,
  type DemoEvent,
  type DemoEventKind,
} from "@/config/demo-log";
import { Activity, ChevronDown, ChevronUp, Trash2 } from "lucide-react";

const KIND_LABEL: Record<DemoEventKind, string> = {
  auth: "AUTH",
  session: "SESSION",
  nav: "NAV",
  link: "LINK",
};

const KIND_CLASS: Record<DemoEventKind, string> = {
  auth: "text-primary",
  session: "text-accent-foreground",
  nav: "text-muted-foreground",
  link: "text-success",
};

/**
 * Floating, demo-mode-only activity log. Shows the simulated auth/session and
 * navigation events with both wall-clock and relative timestamps.
 */
export function DemoActivityLog() {
  const router = useRouter();
  const [demo, setDemo] = useState(false);
  const [open, setOpen] = useState(true);
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setDemo(isDemoMode());
  }, []);

  useEffect(() => {
    if (!demo) return;
    setEvents(getDemoEvents());
    return subscribeDemoEvents(() => setEvents([...getDemoEvents()]));
  }, [demo]);

  useEffect(() => {
    if (!demo) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [demo]);

  // Navigation trail.
  useEffect(() => {
    if (!demo) return;
    logDemoEvent("nav", "Route rendered", window.location.pathname + window.location.search);
    return router.subscribe("onResolved", (e) => {
      logDemoEvent("nav", "Navigated", e.toLocation.href);
    });
  }, [demo, router]);

  if (!demo) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] justify-end">
      <div className="pointer-events-auto w-full overflow-hidden rounded-xl border border-ring/40 bg-card/95 shadow-glow backdrop-blur">
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <p className="flex-1 text-xs font-medium tracking-wide text-foreground">
            Demo activity log
            <span className="ml-1.5 text-muted-foreground">({events.length})</span>
          </p>
          <button
            type="button"
            aria-label="Clear demo activity log"
            onClick={() => clearDemoEvents()}
            className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={open ? "Collapse demo activity log" : "Expand demo activity log"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>

        {open && (
          <ul className="max-h-[15rem] divide-y divide-border/40 overflow-y-auto">
            {events.length === 0 ? (
              <li className="px-3 py-4 text-xs text-muted-foreground">
                No simulated actions yet. Sign in, redeem a code or move between screens.
              </li>
            ) : (
              events.map((e) => (
                <li key={e.id} className="px-3 py-2">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`font-mono text-[10px] font-semibold tracking-wider ${KIND_CLASS[e.kind]}`}
                    >
                      {KIND_LABEL[e.kind]}
                    </span>
                    <span className="flex-1 text-xs text-foreground">{e.message}</span>
                    <span className="font-mono text-[10px] text-muted-foreground/80">
                      {formatClock(e.at)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate pl-[3.1rem] font-mono text-[10px] text-muted-foreground/80">
                    {e.detail ? `${e.detail} · ` : ""}
                    {formatDemoTime(e.at, now)}
                  </p>
                </li>
              ))
            )}
          </ul>
        )}

        {open && (
          <div className="border-t border-border/60 px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full text-[11px]"
              onClick={() => logDemoEvent("session", "Manual marker added")}
            >
              Add marker
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
