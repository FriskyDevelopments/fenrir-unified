import posthog from "posthog-js";

/**
 * Browser-side PostHog. Uses the project token synced by the PostHog
 * connector — safe to expose, it can only send events.
 */
let ready: boolean | null = null;

function init(): boolean {
  if (ready !== null) return ready;
  if (typeof window === "undefined") return false;

  const token = import.meta.env["VITE_LOVABLE_CONNECTOR_POSTHOG_API_KEY"] as string | undefined;
  if (!token) {
    ready = false;
    return false;
  }

  const region = (import.meta.env["VITE_LOVABLE_CONNECTOR_POSTHOG_REGION"] as string) || "eu";
  posthog.init(token, {
    api_host: region === "us" ? "https://us.i.posthog.com" : "https://eu.i.posthog.com",
    capture_pageview: false,
    persistence: "localStorage+cookie",
  });
  ready = true;
  return true;
}

export function captureEvent(event: string, properties?: Record<string, unknown>) {
  if (!init()) return;
  posthog.capture(event, properties);
}
