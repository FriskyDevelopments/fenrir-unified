import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy Lovable OAuth consent URLs may remain in users' browser history.
 * Community Bridge now uses Supabase Auth directly, so retire the broker and
 * send stale approval sessions to the canonical gate onboarding flow.
 */
export const Route = createFileRoute("/.lovable/oauth/consent")({
  beforeLoad: () => {
    throw redirect({ href: "/gate?onboarding=1" });
  },
});
