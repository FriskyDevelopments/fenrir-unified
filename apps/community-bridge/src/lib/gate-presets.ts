/**
 * Visual presets for the Public Gate Builder.
 *
 * Every preset is fully self-contained: logo, mascot and background/atmosphere
 * are bundled, so a brand-new gate looks great with ZERO configuration.
 */

export const DEFAULT_LOGO_URL = "/fenrir-cut-wordmark.svg";

/**
 * A public Gate must never appear policy-free. Hosts can replace both values
 * in the builder; these are a neutral baseline for existing and new Gates.
 */
export const DEFAULT_GATE_RULES =
  "Zero tolerance: no sexual content involving minors or animals, with no exceptions or workarounds. Respect people and the host's boundaries. No harassment, spam, impersonation, unlawful content, or sharing private material without consent. Follow the host's instructions and Telegram's terms.";
export const DEFAULT_GATE_DISCLAIMER =
  "This is a private community entrance for members and invited guests. By continuing, you agree to this Gate's rules. Access may be declined or revoked by the host.";

export type MascotKey = "ghost" | "wolf" | "shield" | "flame" | "sparkle" | "wave" | "crown";

export interface GatePreset {
  id: string;
  name: string;
  tagline: string;
  /** Bundled logo used when the user has not supplied their own. */
  logoUrl: string;
  /** Bundled mascot — rendered as line art, never needs hosting. */
  mascot: MascotKey;
  /** Atmosphere: CSS background used when no background image is supplied. */
  atmosphere: string;
  /** Accent color used for glows and the sign-in button. */
  accent: string;
  /** Overlay strength applied on top of a custom background image. */
  overlay: string;
  /** Thumbnail background for the preset picker card. */
  thumb: string;
  /**
   * White-label link: the brand (tenant) this preset visually belongs to.
   * A gate using this preset hands `?brand=<brandId>` to /login, so the
   * sign-in screen matches the gate the visitor came from.
   */
  brandId: string;
}


export const GATE_PRESETS: GatePreset[] = [
  {
    id: "lore-neon",
    name: "LORE neon",
    tagline: "Electric, high-contrast, arcade glow",
    logoUrl: DEFAULT_LOGO_URL,
    mascot: "ghost",
    atmosphere:
      "radial-gradient(ellipse 70% 55% at 50% 0%, oklch(0.62 0.24 320 / 45%), transparent 70%), radial-gradient(ellipse 60% 50% at 15% 100%, oklch(0.70 0.19 200 / 38%), transparent 72%), linear-gradient(180deg, oklch(0.17 0.05 285), oklch(0.12 0.03 275))",
    accent: "oklch(0.70 0.21 320)",
    overlay:
      "linear-gradient(180deg, oklch(0.12 0.04 285 / 72%), oklch(0.10 0.03 275 / 92%))",
    thumb:
      "radial-gradient(circle at 30% 20%, oklch(0.68 0.24 320 / 70%), transparent 60%), radial-gradient(circle at 75% 80%, oklch(0.72 0.19 200 / 60%), transparent 60%), linear-gradient(160deg, oklch(0.18 0.05 285), oklch(0.11 0.03 275))",
    brandId: "lore",
  },
  {
    id: "fenrir-dark",
    name: "Fenrir dark",
    tagline: "House style — deep navy with ember red",
    logoUrl: DEFAULT_LOGO_URL,
    mascot: "wolf",
    atmosphere:
      "radial-gradient(ellipse 65% 50% at 50% 0%, oklch(0.637 0.208 25.3 / 30%), transparent 70%), radial-gradient(ellipse 55% 45% at 90% 100%, oklch(0.723 0.192 149.6 / 20%), transparent 72%), linear-gradient(180deg, oklch(0.19 0.035 262), oklch(0.149 0.017 259.9))",
    accent: "oklch(0.637 0.208 25.3)",
    overlay:
      "linear-gradient(180deg, oklch(0.149 0.017 259.9 / 72%), oklch(0.149 0.017 259.9 / 94%))",
    thumb:
      "radial-gradient(circle at 25% 15%, oklch(0.637 0.208 25.3 / 65%), transparent 60%), radial-gradient(circle at 80% 85%, oklch(0.723 0.192 149.6 / 45%), transparent 60%), linear-gradient(160deg, oklch(0.20 0.04 262), oklch(0.13 0.02 260))",
    brandId: "myfenrir",
  },
  {
    id: "minimal",
    name: "Minimal",
    tagline: "Quiet slate, no glow, all typography",
    logoUrl: DEFAULT_LOGO_URL,
    mascot: "shield",
    atmosphere:
      "linear-gradient(180deg, oklch(0.26 0.012 258), oklch(0.19 0.008 258))",
    accent: "oklch(0.80 0.02 255)",
    overlay:
      "linear-gradient(180deg, oklch(0.20 0.01 258 / 78%), oklch(0.17 0.008 258 / 94%))",
    thumb: "linear-gradient(160deg, oklch(0.30 0.012 258), oklch(0.18 0.008 258))",
    brandId: "clipsflow",
  },
  {
    id: "ember-noir",
    name: "Ember noir",
    tagline: "Near-black with a single molten highlight",
    logoUrl: DEFAULT_LOGO_URL,
    mascot: "flame",
    atmosphere:
      "radial-gradient(ellipse 60% 45% at 50% 100%, oklch(0.68 0.19 42 / 40%), transparent 72%), linear-gradient(180deg, oklch(0.13 0.012 40), oklch(0.09 0.008 30))",
    accent: "oklch(0.72 0.18 42)",
    overlay:
      "linear-gradient(180deg, oklch(0.10 0.01 35 / 76%), oklch(0.08 0.008 30 / 95%))",
    thumb:
      "radial-gradient(circle at 50% 90%, oklch(0.74 0.19 42 / 75%), transparent 62%), linear-gradient(160deg, oklch(0.15 0.012 40), oklch(0.09 0.008 30))",
    brandId: "myfenrir",
  },
  {
    id: "aurora-mint",
    name: "Aurora mint",
    tagline: "Cool teal aurora, fresh and calm",
    logoUrl: DEFAULT_LOGO_URL,
    mascot: "wave",
    atmosphere:
      "radial-gradient(ellipse 75% 55% at 20% 0%, oklch(0.75 0.16 170 / 38%), transparent 70%), radial-gradient(ellipse 60% 50% at 85% 90%, oklch(0.66 0.15 235 / 34%), transparent 72%), linear-gradient(180deg, oklch(0.18 0.03 200), oklch(0.13 0.02 210))",
    accent: "oklch(0.76 0.15 170)",
    overlay:
      "linear-gradient(180deg, oklch(0.14 0.02 200 / 72%), oklch(0.11 0.015 210 / 94%))",
    thumb:
      "radial-gradient(circle at 25% 20%, oklch(0.78 0.16 170 / 70%), transparent 60%), radial-gradient(circle at 80% 82%, oklch(0.68 0.15 235 / 55%), transparent 60%), linear-gradient(160deg, oklch(0.19 0.03 200), oklch(0.12 0.02 210))",
    brandId: "clipsflow",
  },
  {
    id: "royal-violet",
    name: "Royal violet",
    tagline: "Deep plum with a gold-lit crown",
    logoUrl: DEFAULT_LOGO_URL,
    mascot: "crown",
    atmosphere:
      "radial-gradient(ellipse 65% 50% at 50% 0%, oklch(0.55 0.20 300 / 42%), transparent 70%), radial-gradient(ellipse 50% 40% at 90% 100%, oklch(0.80 0.14 88 / 22%), transparent 72%), linear-gradient(180deg, oklch(0.18 0.05 300), oklch(0.12 0.03 300))",
    accent: "oklch(0.80 0.14 88)",
    overlay:
      "linear-gradient(180deg, oklch(0.14 0.04 300 / 74%), oklch(0.10 0.03 300 / 94%))",
    thumb:
      "radial-gradient(circle at 30% 18%, oklch(0.58 0.21 300 / 75%), transparent 60%), radial-gradient(circle at 82% 84%, oklch(0.82 0.14 88 / 50%), transparent 58%), linear-gradient(160deg, oklch(0.19 0.05 300), oklch(0.11 0.03 300))",
    brandId: "lore",
  },
  {
    id: "paper-light",
    name: "Paper light",
    tagline: "Bright daylight card on warm paper",
    logoUrl: DEFAULT_LOGO_URL,
    mascot: "sparkle",
    atmosphere:
      "radial-gradient(ellipse 70% 50% at 50% 0%, oklch(0.92 0.03 250 / 90%), transparent 72%), linear-gradient(180deg, oklch(0.96 0.01 90), oklch(0.88 0.02 250))",
    accent: "oklch(0.52 0.16 258)",
    overlay:
      "linear-gradient(180deg, oklch(0.20 0.02 258 / 55%), oklch(0.16 0.015 258 / 85%))",
    thumb:
      "radial-gradient(circle at 30% 20%, oklch(0.99 0.01 90), transparent 60%), linear-gradient(160deg, oklch(0.96 0.01 90), oklch(0.86 0.03 250))",
    brandId: "clipsflow",
  },
];


export const DEFAULT_PRESET_ID = "fenrir-dark";

export function getPreset(id: string | null | undefined): GatePreset {
  return (
    GATE_PRESETS.find((p) => p.id === id) ??
    GATE_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!
  );
}

export interface GateConfig {
  slug: string;
  /**
   * The owning Community tenant. This is deliberately carried by a public Gate
   * so the visitor enters the same branded Community organization after the
   * verification step; it must never be inferred from a visual preset.
   */
  brand_id?: string;
  preset: string;
  headline: string;
  subheadline: string;
  logo_url: string | null;
  mascot_url: string | null;
  background_url: string | null;
  /** Host-owned rules presented at this particular Gate. */
  rules_text: string;
  /** Short access notice presented before a visitor begins SSO. */
  disclaimer_text: string;
  /** Increment whenever the host materially changes the access policy. */
  policy_version: number;
}

export const DEFAULT_GATE: Omit<GateConfig, "slug"> = {
  preset: DEFAULT_PRESET_ID,
  headline: "Members only",
  subheadline: "Sign in to continue to the portal.",
  logo_url: null,
  mascot_url: null,
  background_url: null,
  rules_text: DEFAULT_GATE_RULES,
  disclaimer_text: DEFAULT_GATE_DISCLAIMER,
  policy_version: 1,
};

/** Accepts only public https URLs (or the bundled root-relative defaults). */
export function isUsableImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return true;
  try {
    return new URL(trimmed).protocol === "https:";
  } catch {
    return false;
  }
}

/** Same rule as images — kept as its own name now that video is accepted too. */
export const isUsableMediaUrl = isUsableImageUrl;

/** Extensions we render inside a <video> element instead of an <img>. */
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i;

/** True when the media should animate through a muted, looping <video>. */
export function isVideoUrl(value: string | null | undefined): boolean {
  return Boolean(value && VIDEO_EXTENSIONS.test(value.trim()));
}

/** Everything the gate uploader accepts, for `accept` attributes and checks. */
export const GATE_MEDIA_ACCEPT =
  "image/png,image/jpeg,image/webp,image/avif,image/gif,image/svg+xml,video/mp4,video/webm,video/quicktime";

export const GATE_MEDIA_TYPE_PATTERN =
  /^(image\/(png|jpeg|webp|avif|gif|svg\+xml)|video\/(mp4|webm|quicktime))$/;

/** Images stay small; short looping videos get more room. */
export const GATE_MEDIA_MAX_BYTES = { image: 5 * 1024 * 1024, video: 20 * 1024 * 1024 };
