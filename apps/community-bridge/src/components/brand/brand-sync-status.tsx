import { Radio, WifiOff } from "lucide-react";
import { useBrandSyncStatus } from "@/config/use-brand-sync-status";
import { cn } from "@/lib/utils";

/**
 * Live indicator for the shared brand/theme channel: shows whether this tab is
 * receiving updates from other tabs and when the last change was applied.
 */
export function BrandSyncStatus({ className }: { className?: string }) {
  const { listening, crossTab, lastKind, lastAt, lastLabel } = useBrandSyncStatus();

  const live = listening && crossTab;
  const detail = lastLabel
    ? `${lastKind === "draft" ? "Draft" : "Saved"} theme applied ${lastLabel}`
    : live
      ? "Waiting for changes"
      : "Refresh to see changes";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur",
        className,
      )}
      role="status"
      aria-live="polite"
      title={
        lastAt ? `Last brand update applied at ${new Date(lastAt).toLocaleTimeString()}` : undefined
      }
    >
      {live ? (
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
      ) : (
        <WifiOff className="h-3 w-3" aria-hidden />
      )}
      <span className="font-medium text-foreground/90">
        {live ? "Theme sync live" : "Theme sync off"}
      </span>
      <span aria-hidden className="text-border">
        •
      </span>
      <span className="inline-flex items-center gap-1">
        {live && lastLabel ? <Radio className="h-3 w-3 text-primary" aria-hidden /> : null}
        {detail}
      </span>
    </span>
  );
}
