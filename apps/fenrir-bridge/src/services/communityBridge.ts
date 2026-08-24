// La app separada del Community Bridge (apps/community-bridge, base Neon)
// vive en communities.myfenrir.com; el dashboard principal solo enlaza ahí.
// Launch into the guided first-run experience. The Community Bridge app
// keeps the query in the URL so it can show its walkthrough/wizard before
// handing the user to the normal dashboard on subsequent visits.
const DEFAULT_TARGET_URL = "https://communities.myfenrir.com/gate?onboarding=1";

// Fenrir → Community Bridge SSO handoff (functions/api/auth/community-sso.ts).
// Reads the signed-in Fenrir session and mints a Supabase session cookie on
// .myfenrir.com, so a gate-verified user lands in Community Bridge ALREADY
// authenticated instead of re-verifying. No Fenrir session => it falls back to
// the Community Bridge login (never a hard error). This is the link that was
// missing: every "Open Community Bridge" entry now carries the session.
const COMMUNITY_SSO_HANDOFF = "https://www.myfenrir.com/api/auth/community-sso";

const configuredTargetUrl = (
  import.meta.env.VITE_COMMUNITY_BRIDGE_DASHBOARD_URL ??
  DEFAULT_TARGET_URL
).trim() || DEFAULT_TARGET_URL;

/** Wrap a communities.myfenrir.com destination in the SSO handoff so the gate
 *  session carries over (no re-verify). */
function communityBridgeSsoUrl(target: string): string {
  const url = new URL(COMMUNITY_SSO_HANDOFF);
  url.searchParams.set("next", target);
  return url.toString();
}

/** Raw Community Bridge target, no session handoff. */
export const communityBridgeTargetUrl = configuredTargetUrl;

/** Default "Open Community Bridge" link — routes through the SSO handoff. */
export const communityBridgeDashboardUrl = communityBridgeSsoUrl(configuredTargetUrl);

export function communityBridgeUrlForLocale(locale: string) {
  const target = new URL(configuredTargetUrl);
  target.searchParams.set("lang", locale);
  return communityBridgeSsoUrl(target.toString());
}

export function communityBridgeGateUrl(slug: string, locale?: string) {
  const target = new URL(`/g/${encodeURIComponent(slug)}`, "https://communities.myfenrir.com");
  if (locale) target.searchParams.set("lang", locale);
  return communityBridgeSsoUrl(target.toString());
}
