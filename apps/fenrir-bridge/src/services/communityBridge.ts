// La app separada del Community Bridge (apps/community-bridge, base Neon)
// vive en communities.myfenrir.com; el dashboard principal solo enlaza ahí.
// Launch into the guided first-run experience. The Community Bridge app
// keeps the query in the URL so it can show its walkthrough/wizard before
// handing the user to the normal dashboard on subsequent visits.
const DEFAULT_DASHBOARD_URL = "https://communities.myfenrir.com/gate?onboarding=1";

const configuredDashboardUrl = (
  import.meta.env.VITE_COMMUNITY_BRIDGE_DASHBOARD_URL ??
  DEFAULT_DASHBOARD_URL
).trim();

export const communityBridgeDashboardUrl = configuredDashboardUrl || DEFAULT_DASHBOARD_URL;
