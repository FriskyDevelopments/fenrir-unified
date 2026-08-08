import { Eye } from "lucide-react";
import type { GateViewStats } from "@/lib/gate-analytics.functions";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/** Compact views-and-trend panel shown on each gate card in My Gates. */
export function GateAnalyticsPanel({
  stats,
  accent,
  loading,
}: {
  stats: GateViewStats | undefined;
  accent: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-10 animate-pulse rounded bg-muted/60" />
      </div>
    );
  }

  const daily = stats?.daily ?? [];
  const peak = Math.max(1, ...daily.map((d) => d.views));

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <Eye className="h-3 w-3" aria-hidden="true" />
          Last 7 days
        </span>
        <span className="text-sm font-semibold tabular-nums">{stats?.last7 ?? 0}</span>
      </div>

      <div className="mt-3 flex h-12 items-end gap-1" aria-hidden="true">
        {daily.map((day) => (
          <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-sm transition-all"
              style={{
                height: `${Math.max(6, (day.views / peak) * 100)}%`,
                background:
                  day.views > 0
                    ? `color-mix(in oklab, ${accent} 70%, transparent)`
                    : "hsl(var(--muted))",
              }}
              title={`${day.date}: ${day.views} views`}
            />
            <span className="text-[9px] leading-none text-muted-foreground">
              {DAY_LABELS[new Date(`${day.date}T00:00:00Z`).getUTCDay()]}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground">
        {stats?.total ?? 0} views all time
      </p>
    </div>
  );
}
