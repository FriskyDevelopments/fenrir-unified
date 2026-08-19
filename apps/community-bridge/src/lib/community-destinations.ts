export type CommunityDestinationProvider = "telegram" | "discord" | "whatsapp" | "x" | "other";

export type CommunityDestinationState = "live" | "adapter_ready" | "planned";

export type CommunityDestinationAdapter = {
  id: CommunityDestinationProvider;
  label: string;
  eyebrow: string;
  description: string;
  state: CommunityDestinationState;
  requiredCapabilities: readonly string[];
  setup: {
    mode: "bot_admin" | "oauth" | "provider_account" | "custom";
    ownerAction: string;
  };
};

export const COMMUNITY_DESTINATION_ADAPTERS: readonly CommunityDestinationAdapter[] = [
  {
    id: "telegram",
    label: "Telegram",
    eyebrow: "Live now",
    description: "Protected group, private bot waiting room and one-time invites.",
    state: "live",
    requiredCapabilities: ["invite_users", "create_invite_link"],
    setup: {
      mode: "bot_admin",
      ownerAction: "Add @Myfenrir_bot as admin and allow Invite Users.",
    },
  },
  {
    id: "discord",
    label: "Discord",
    eyebrow: "Coming soon",
    description: "Server, verified-member role and private invite destination.",
    state: "planned",
    requiredCapabilities: ["create_instant_invite", "manage_roles"],
    setup: {
      mode: "oauth",
      ownerAction: "Connect a Discord application, then choose a server and member role.",
    },
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    eyebrow: "Connector slot",
    description: "Community or channel handoff without changing the Gate URL or QR.",
    state: "planned",
    requiredCapabilities: ["manage_invites"],
    setup: {
      mode: "provider_account",
      ownerAction: "Attach a supported WhatsApp Business provider when enabled.",
    },
  },
  {
    id: "x",
    label: "X",
    eyebrow: "Connector slot",
    description: "Private community access and member handoff for X.",
    state: "planned",
    requiredCapabilities: ["users.read", "follows.read"],
    setup: {
      mode: "oauth",
      ownerAction: "Authorize an X community when this connector is enabled.",
    },
  },
  {
    id: "other",
    label: "Custom",
    eyebrow: "Extension slot",
    description: "A provider-neutral adapter for the next community platform.",
    state: "planned",
    requiredCapabilities: [],
    setup: {
      mode: "custom",
      ownerAction: "Register an adapter without migrating the community or reissuing its Gate.",
    },
  },
] as const;

export function destinationStateLabel(state: CommunityDestinationState): string {
  if (state === "live") return "Live";
  if (state === "adapter_ready") return "Coming soon";
  return "Coming soon";
}
