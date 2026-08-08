// La app separada del Community Bridge (apps/community-bridge, base Neon)
// vive en communities.myfenrir.com; el dashboard principal solo enlaza ahí.
const DEFAULT_DASHBOARD_URL = "https://communities.myfenrir.com/dashboard";

const configuredDashboardUrl = (
  import.meta.env.VITE_COMMUNITY_BRIDGE_DASHBOARD_URL ??
  DEFAULT_DASHBOARD_URL
).trim();

export const communityBridgeDashboardUrl = configuredDashboardUrl || DEFAULT_DASHBOARD_URL;
