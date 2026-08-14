export const HOST_STANDARDS_POLICY = "community-host-standards";
export const HOST_STANDARDS_VERSION = 1;

export type OwnerLanding = "/gates" | "/gate";

/** Existing owners always land on their inventory; an empty account may start setup. */
export function ownerLanding(gateCount: number): OwnerLanding {
  return gateCount > 0 ? "/gates" : "/gate";
}

export function needsHostStandardsAcceptance(acceptedVersion: number | null): boolean {
  return acceptedVersion !== HOST_STANDARDS_VERSION;
}

export const POLICY_TEMPLATES = [
  {
    id: "community-standards",
    label: "Community Standards",
    description: "A balanced baseline for member-led communities.",
    disclaimer: "This is a private community entrance for members and invited guests. By continuing, you agree to respect the people and boundaries in this space.",
    rules: "Zero tolerance: no sexual content involving minors or animals, with no exceptions or workarounds. Respect people and the host's boundaries. No harassment, threats, slurs, spam, impersonation, unlawful content, or sharing private material without consent. Follow the host's instructions and Telegram's terms.",
  },
  {
    id: "creator-led",
    label: "Creator-led",
    description: "Drops, fan spaces, and creator-hosted conversations.",
    disclaimer: "You are entering an independent creator community. Membership is personal and access is governed by the host's rules.",
    rules: "Zero tolerance: no sexual content involving minors or animals, with no exceptions or workarounds. Support the creator and fellow members. Do not repost paid, private, or member-only material. No spam, scams, harassment, impersonation, or unauthorized promotion. Follow moderator instructions.",
  },
  {
    id: "events",
    label: "Events",
    description: "Live rooms, cohorts, workshops, and scheduled gatherings.",
    disclaimer: "This Gate opens into a hosted event. Access is for registered members and invited guests.",
    rules: "Zero tolerance: no sexual content involving minors or animals, with no exceptions or workarounds. Follow the event format and host directions. Use the queue when the room is live, protect confidential material, and make room for every voice. No recording or reposting without explicit permission.",
  },
  {
    id: "custom",
    label: "Custom",
    description: "Start from the safety minimum, then write your own house rules.",
    disclaimer: "This is a private community entrance. Review this Gate's access notice and house rules before continuing.",
    rules: "Zero tolerance: no sexual content involving minors or animals, with no exceptions or workarounds. No harassment, threats, slurs, impersonation, unlawful content, or sharing private material without consent. Add the host-specific expectations for this Gate here.",
  },
] as const;

export function getPolicyTemplate(id: string) {
  return POLICY_TEMPLATES.find((template) => template.id === id) ?? POLICY_TEMPLATES[0];
}
