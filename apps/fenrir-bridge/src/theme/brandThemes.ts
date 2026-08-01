import type { CSSProperties } from "react";

export type BrandKey = "fenrir" | "neonNexus" | "stixMagic";

export type BrandTheme = {
  key: BrandKey;
  productName: string;
  systemRole: string;
  logoSrc: string;
  logoAlt: string;
  heroSrc?: string;
  heroAlt?: string;
  headline: string;
  subheadline: string;
  lanes: string[];
  nodeStatus: string[];
  authKicker: string;
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
  background:
    | "protocol"
    | "nexus"
    | "experimental";
};

export const brandThemes: Record<BrandKey, BrandTheme> = {
  fenrir: {
    key: "fenrir",
    productName: "Fenrir Bridge",
    systemRole: "trusted protocol",
    logoSrc: "/fenrir-cut-wordmark.svg",
    logoAlt: "Fenrir",
    headline: "Secure the front door to every Telegram group.",
    subheadline: "Stable branded links, invite rotation, and clean workspace sessions for Frisky clients.",
    lanes: ["IDENTITY", "WORKSPACES", "MEDIA", "AI AGENTS", "PROTOCOL SERVICES"],
    nodeStatus: ["AUTH ONLINE", "SESSION BRIDGE ACTIVE", "PASSKEY READY", "PROTOCOL STABLE"],
    authKicker: "OAuth + passkeys",
    // FriskyDev system: gold accent over paper/ink — not the LORE neon set.
    primary: "#c2a469",
    secondary: "#7fae9d",
    accent: "#8a6e3c",
    glow: "rgba(194, 164, 105, .22)",
    background: "protocol"
  },
  neonNexus: {
    key: "neonNexus",
    productName: "Neon Nexus",
    systemRole: "futuristic cyber layer",
    logoSrc: "/fenrir-cut-wordmark.svg",
    logoAlt: "Neon Nexus",
    headline: "Community access through a separate Neon gate.",
    subheadline: "Invite verification, isolated sessions, and Neon-backed membership state for community products.",
    lanes: ["NEON AUTH", "COMMUNITY ACCESS", "INVITE CODES", "SEPARATE DATABASE", "REAL GATE"],
    nodeStatus: ["NEON READY", "INVITES CHECKED", "SESSION SCOPED", "AUDIT LOGGED"],
    authKicker: "Neon auth",
    primary: "#22c7a8",
    secondary: "#8cb9ff",
    accent: "#9b8cff",
    glow: "rgba(34, 199, 168, .24)",
    background: "nexus"
  },
  stixMagic: {
    key: "stixMagic",
    productName: "STIX MΛGIC",
    systemRole: "experimental layer",
    logoSrc: "/fenrir-cut-wordmark.svg",
    logoAlt: "STIX MΛGIC",
    headline: "Experimental gateway for magical text systems.",
    subheadline: "The wildest Frisky surface keeps the same auth contract while changing the skin.",
    lanes: ["SPELLS", "SIGNALS", "TEXT OPS", "ROUTES", "EXPERIMENTS"],
    nodeStatus: ["LAB ONLINE", "THEME HOT", "ROUTES READY", "MAGIC STABLE"],
    authKicker: "Experimental",
    primary: "#9b8cff",
    secondary: "#ff6c84",
    accent: "#f1b75c",
    glow: "rgba(155, 140, 255, .26)",
    background: "experimental"
  }
};

export function themeCssVars(theme: BrandTheme): CSSProperties {
  return {
    "--theme-primary": theme.primary,
    "--theme-secondary": theme.secondary,
    "--theme-accent": theme.accent,
    "--theme-glow": theme.glow
  } as CSSProperties;
}

export function themeClassName(theme: BrandTheme) {
  return `theme-${theme.key}`;
}
