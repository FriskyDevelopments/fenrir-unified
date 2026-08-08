const configuredDashboardUrl = (
  import.meta.env.VITE_COMMUNITY_BRIDGE_DASHBOARD_URL ??
  "https://gate.myfenrir.com/dashboard"
).trim();

export const communityBridgeDashboardUrl =
  configuredDashboardUrl || "https://gate.myfenrir.com/dashboard";
