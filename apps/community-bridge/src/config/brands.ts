/**
 * White-label brand / tenant registry.
 *
 * This is the ONLY place a new product, community or "casa" has to be added.
 * A brand entry drives:
 *   - the product name + tagline + legal links
 *   - the logo (bundled asset URL, or a text wordmark when there is no file)
 *   - the color palette (CSS custom-property overrides, applied at runtime)
 *   - which OAuth providers appear, in order (Apple → Google → Microsoft base)
 *   - the tenant / community it fronts (Telegram community id + invite URL)
 *   - the post-login redirect
 *   - the matching Public Gate Builder preset (presets ARE the white-label themes)
 *
 * Nothing here is a code change: adding LORE, ClipsFlow or any other brand
 * is a new object in BRANDS.
 */

// Use assets shipped by this app. The old /__l5e path only exists in the
// design workspace and returns 404 on gate.myfenrir.com.
// La marca cuadrada de Fenrir (el favicon heredado era el icono de ClipsFlow).
const MYFENRIR_MARK_URL = "/fenrir-mark.svg";
const MYFENRIR_WORDMARK_URL = "/fenrir-cut-wordmark.svg";

export type ProviderId = "apple" | "google" | "microsoft";

/** Base SSO set, in the order the product requires. */
export const BASE_PROVIDERS: ProviderId[] = ["apple", "google", "microsoft"];

export interface BrandLogo {
  /** Square mark. Falls back to the brand initials when omitted. */
  markUrl?: string;
  /** Horizontal wordmark. Falls back to rendered text when omitted. */
  wordmarkUrl?: string;
  /** Accessible name for both. */
  alt: string;
}

export interface BrandConfig {
  /** Tenant id — stable key stored on gates and sent to analytics. */
  id: string;
  /** Product name shown in copy and page titles. */
  name: string;
  tagline: string;
  /** Hostnames that resolve to this brand (exact host, no protocol). */
  hosts: string[];
  logo: BrandLogo;
  /** CSS custom-property overrides layered on top of the base design system. */
  theme: Record<string, string>;
  /** Ordered OAuth providers for this brand's sign-in screen. */
  providers: ProviderId[];
  /** The community / gate this brand fronts. */
  community: {
    id: string;
    label: string;
    /** Public invite or bot deep link, when the community has one. */
    url?: string;
  };
  redirect: {
    /** Where a successful sign-in lands when no `next` is present. */
    afterLogin: string;
    /** Public, same-origin OAuth return path. Never a protected route. */
    oauthReturnPath: string;
  };
  /** Gate Builder preset used as this brand's default gate theme. */
  gatePreset: string;
  /** Command shown in the animated auth terminal. */
  terminalCommand: string;
  /** Editable sign-in screen copy. Falls back to generic defaults. */
  login?: {
    headline?: string;
    subheadline?: string;
    /** Label prefix on each SSO button, e.g. "Continue with". */
    signInLabel?: string;
    /** Sign-up link text. Hidden when empty. */
    signUpLabel?: string;
    /** Forgot-password / trouble-signing-in link text. Hidden when empty. */
    forgotLabel?: string;
    /** Terminal shell header label, e.g. "auth_session.sh". */
    terminalHeader?: string;
    /** Terminal command after the prompt, e.g. "fenrir --login". */
    terminalCommand?: string;
    /** Extra terminal status lines (optional). */
    terminalLines?: string[];
  };
  /** Editable "Activate your account" (Telegram linking) screen copy. */
  activate?: {
    headline?: string;
    subheadline?: string;
    /** Title of the "get your linking code" steps card. */
    stepsTitle?: string;
    /** Label on the button that opens the Telegram bot. */
    botLabel?: string;
    /** Label on the submit button. */
    submitLabel?: string;
    /** Headline shown once linking succeeded. */
    successHeadline?: string;
  };

  links: {
    site?: string;
    terms: string;
    privacy: string;
  };
}

export const BRANDS: BrandConfig[] = [
  {
    id: "myfenrir",
    name: "MyFenrir",
    tagline: "Secure access and public gates for your Telegram community",
    // communities.* es la superficie separada del Community Bridge: sin este
    // host caía en el brand por defecto y tomaba el logo del tenant heredado.
    hosts: ["myfenrir.com", "www.myfenrir.com", "communities.myfenrir.com"],
    logo: { markUrl: MYFENRIR_MARK_URL, wordmarkUrl: MYFENRIR_WORDMARK_URL, alt: "MyFenrir logo" },
    theme: {
      "--primary": "oklch(0.637 0.208 25.3)",
      "--ring": "oklch(0.637 0.208 25.3)",
      "--glow-primary": "0 0 40px -8px oklch(0.637 0.208 25.3 / 45%)",
    },
    providers: BASE_PROVIDERS,
    community: { id: "myfenrir-core", label: "MyFenrir" },
    redirect: { afterLogin: "/dashboard", oauthReturnPath: "/" },
    gatePreset: "fenrir-dark",
    terminalCommand: "fenrir --login",
    links: {
      site: "https://myfenrir.com",
      terms: "https://www.myfenrir.com/terms",
      privacy: "https://www.myfenrir.com/privacy",
    },
  },
  {
    id: "lore",
    name: "LORE",
    tagline: "Enter the archive — members-only lore, drops and channels",
    hosts: ["lore.myfenrir.com"],
    logo: { alt: "LORE logo" },
    theme: {
      "--primary": "oklch(0.70 0.21 320)",
      "--accent": "oklch(0.72 0.19 200)",
      "--ring": "oklch(0.70 0.21 320)",
      "--background": "oklch(0.135 0.03 285)",
      "--card": "oklch(0.20 0.045 288)",
      "--glow-primary": "0 0 44px -8px oklch(0.70 0.21 320 / 50%)",
    },
    providers: BASE_PROVIDERS,
    community: { id: "lore-archive", label: "LORE archive" },
    redirect: { afterLogin: "/dashboard", oauthReturnPath: "/" },
    gatePreset: "lore-neon",
    terminalCommand: "lore --enter",
    links: {
      terms: "https://www.myfenrir.com/terms",
      privacy: "https://www.myfenrir.com/privacy",
    },
  },
  {
    id: "clipsflow",
    name: "ClipsFlow",
    tagline: "Creator access, clip drops and role automation",
    hosts: ["clipsflow.app"],
    logo: { alt: "ClipsFlow logo" },
    theme: {
      "--primary": "oklch(0.68 0.17 250)",
      "--accent": "oklch(0.74 0.15 195)",
      "--ring": "oklch(0.68 0.17 250)",
      "--background": "oklch(0.15 0.02 258)",
      "--card": "oklch(0.215 0.032 258)",
      "--glow-primary": "0 0 40px -8px oklch(0.68 0.17 250 / 45%)",
    },
    providers: BASE_PROVIDERS,
    community: { id: "clipsflow-creators", label: "ClipsFlow creators" },
    redirect: { afterLogin: "/dashboard", oauthReturnPath: "/" },
    gatePreset: "minimal",
    terminalCommand: "clipsflow --login",
    links: {
      terms: "https://www.myfenrir.com/terms",
      privacy: "https://www.myfenrir.com/privacy",
    },
  },
];

export const DEFAULT_BRAND_ID = "myfenrir";

export function getBrand(id: string | null | undefined): BrandConfig {
  return BRANDS.find((b) => b.id === id) ?? BRANDS.find((b) => b.id === DEFAULT_BRAND_ID)!;
}

export function getBrandByHost(host: string | null | undefined): BrandConfig | null {
  if (!host) return null;
  const clean = host.toLowerCase().split(":")[0]!;
  return BRANDS.find((b) => b.hosts.includes(clean)) ?? null;
}

/** Two-letter fallback used when a brand has no logo file yet. */
export function brandInitials(brand: BrandConfig): string {
  const words = brand.name
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .trim()
    .split(/\s+/);
  if (words.length > 1) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return brand.name.slice(0, 2).toUpperCase();
}

/** Sign-in screen copy for a brand, with generic fallbacks. */
export function brandLoginCopy(brand: BrandConfig): {
  headline: string;
  subheadline: string;
  signInLabel: string;
  signUpLabel: string;
  forgotLabel: string;
  terminalHeader: string;
  terminalCommand: string;
  terminalLines: string[];
} {
  return {
    headline: brand.login?.headline?.trim() || "Welcome back",
    subheadline: brand.login?.subheadline?.trim() || `Sign in to continue to ${brand.name}`,
    signInLabel: brand.login?.signInLabel?.trim() || "Continue with",
    signUpLabel: brand.login?.signUpLabel?.trim() || "",
    forgotLabel: brand.login?.forgotLabel?.trim() || "",
    terminalHeader: brand.login?.terminalHeader?.trim() || "auth_session.sh",
    terminalCommand:
      brand.login?.terminalCommand?.trim() || brand.terminalCommand || "auth --login",
    terminalLines: brand.login?.terminalLines ?? [],
  };
}

/** "Activate your account" (Telegram linking) copy for a brand, with fallbacks. */
export function brandActivateCopy(brand: BrandConfig): {
  headline: string;
  subheadline: string;
  stepsTitle: string;
  botLabel: string;
  submitLabel: string;
  successHeadline: string;
} {
  return {
    headline: brand.activate?.headline?.trim() || "Activate your account",
    subheadline:
      brand.activate?.subheadline?.trim() ||
      `Link your ${brand.name} portal to your Telegram account.`,
    stepsTitle: brand.activate?.stepsTitle?.trim() || "Link your FriskyDev ID",
    botLabel: brand.activate?.botLabel?.trim() || "Open Telegram bot",
    submitLabel: brand.activate?.submitLabel?.trim() || "Activate account",
    successHeadline: brand.activate?.successHeadline?.trim() || "Account activated",
  };
}
