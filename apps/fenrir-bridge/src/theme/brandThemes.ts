import type { CSSProperties } from "react";

export type BrandKey = "fenrir" | "friskyGhost" | "neonNexus" | "stixMagic";

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
    | "ghost"
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
    // PROTOCOL kit (@frisky/kit-fenrir): gold over ink — not the LORE neon set.
    // Source of truth also lives in frisky-ui-kits/packages/tokens/src/brands/fenrir.css
    primary: "#c2a469",
    secondary: "#7fae9d",
    accent: "#8a6e3c",
    glow: "rgba(194, 164, 105, .22)",
    background: "protocol"
  },
  // Frisky Ghost bot-OS skin, restaurada del histórico (pre-6dabefe): la purga
  // LORE retiró la entrada pero /ghost y /bot-os (publicRoutes) siguen usándola.
  friskyGhost: {
    key: "friskyGhost",
    productName: "Frisky Ghost",
    systemRole: "operational layer",
    logoSrc: "/fenrir-cut-wordmark.svg",
    logoAlt: "Frisky Ghost",
    headline: "Ghost login for the bot operating layer.",
    subheadline: "One auth engine, separate product landing, and operational routes for bot-of-bots workflows.",
    lanes: ["BOT OS", "OPERATIONS", "SIGNALS", "WORKERS", "ROUTES"],
    nodeStatus: ["GHOST ONLINE", "BOT OS READY", "ROUTES ISOLATED", "SIGNAL CLEAN"],
    authKicker: "Ghost skin",
    primary: "#f3f6f9",
    secondary: "#8cb9ff",
    accent: "#9b8cff",
    glow: "rgba(140, 185, 255, .22)",
    background: "ghost"
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

/** "#c2a469" → "40 42% 59%" (HSL triplet for hsl(var(--x) / a) consumption). */
export function hexToHslTriplet(hex: string): string {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (delta > 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / delta + 2) * 60;
    else h = ((r - g) / delta + 4) * 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function themeCssVars(theme: BrandTheme): CSSProperties {
  const primary = hexToHslTriplet(theme.primary);
  const secondary = hexToHslTriplet(theme.secondary);
  const accent = hexToHslTriplet(theme.accent);
  return {
    "--theme-primary": theme.primary,
    "--theme-secondary": theme.secondary,
    "--theme-accent": theme.accent,
    "--theme-glow": theme.glow,
    // Community Bridge gate tokens (HSL triplets) — drive the protocol
    // surface (shader, particles, gate-card, gradient headline).
    "--gate-accent": primary,
    "--gate-accent-soft": secondary,
    "--gate-border": primary,
    "--gate-glow": primary,
    "--gate-gradient-start": primary,
    "--gate-gradient-middle": secondary,
    "--gate-gradient-end": accent
  } as CSSProperties;
}

export function themeClassName(theme: BrandTheme) {
  return `theme-${theme.key}`;
}
