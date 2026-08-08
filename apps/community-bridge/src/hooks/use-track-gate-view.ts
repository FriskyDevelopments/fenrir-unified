import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { recordGateView } from "@/lib/gate-analytics.functions";
import { captureEvent } from "@/lib/posthog";

/**
 * Records at most one view per visitor, per gate, per UTC day. The server
 * owns the dedupe decision (httpOnly cookie + unique index), and PostHog only
 * receives `gate_viewed` when that view actually counted — so the My Gates
 * panel and PostHog report the same numbers. Repeat visits within the same day
 * are still visible in PostHog as `gate_view_deduped`.
 */
export function useTrackGateView(slug: string, preset: string) {
  const record = useServerFn(recordGateView);
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (sent.current === slug) return;
    sent.current = slug;

    const referrer = typeof document !== "undefined" ? document.referrer : "";

    void record({ data: { slug, referrer: referrer || undefined } })
      .then((result) => {
        if (!result?.ok) return;
        captureEvent(result.unique ? "gate_viewed" : "gate_view_deduped", {
          gate_slug: slug,
          gate_preset: preset,
          referrer: referrer || null,
          dedupe: "visitor_cookie_per_utc_day",
        });
      })
      .catch(() => {
        /* view tracking must never break the gate */
      });
  }, [slug, preset, record]);
}
