/**
 * @frisky/gate-brand — SHARED SOURCE OF TRUTH for Gate visual branding.
 *
 * This module holds ONLY the brand-visual fields that are identical between
 * the Community Bridge gate (apps/community-bridge/src/lib/gate-presets.ts)
 * and the MyFenrir visual lab (apps/fenrir-bridge /wow, /visual-lab).
 *
 * Both `accent` and `atmosphere` are copied VERBATIM from Community Bridge's
 * GATE_PRESETS so the lab can never drift from the real gate. Consumers that
 * need extra fields (logoUrl, overlay, thumb, brandId — Community Bridge) layer
 * them on top of GateBrandPreset; see ADOPT_IN_COMMUNITY_BRIDGE.md.
 *
 * `accent2` is the SECONDARY hue that already lives inside each preset's own
 * atmosphere gradient, surfaced so an entire surface can recolor coherently
 * (ambient glows), not just a single card. It is optional: presets whose
 * atmosphere is effectively single-hue omit it.
 */

export type MascotKey =
  | "ghost"
  | "wolf"
  | "shield"
  | "flame"
  | "sparkle"
  | "wave"
  | "crown";

export interface GateBrandPreset {
  id: string;
  name: string;
  tagline: string;
  mascot: MascotKey;
  /** CSS background used when no custom background image is supplied. */
  atmosphere: string;
  /** Primary accent — glows and the sign-in button. */
  accent: string;
  /** Secondary ambient hue drawn from the same atmosphere (optional). */
  accent2?: string;
}

export const GATE_BRAND_PRESETS: GateBrandPreset[] = [
  {
    id: "lore-neon",
    name: "LORE neon",
    tagline: "Electric, high-contrast, arcade glow",
    mascot: "ghost",
    atmosphere:
      "radial-gradient(ellipse 70% 55% at 50% 0%, oklch(0.62 0.24 320 / 45%), transparent 70%), radial-gradient(ellipse 60% 50% at 15% 100%, oklch(0.70 0.19 200 / 38%), transparent 72%), linear-gradient(180deg, oklch(0.17 0.05 285), oklch(0.12 0.03 275))",
    accent: "oklch(0.70 0.21 320)",
    accent2: "oklch(0.70 0.19 200)",
  },
  {
    id: "fenrir-dark",
    name: "Fenrir dark",
    tagline: "House style — deep navy with ember red",
    mascot: "wolf",
    atmosphere:
      "radial-gradient(ellipse 65% 50% at 50% 0%, oklch(0.637 0.208 25.3 / 30%), transparent 70%), radial-gradient(ellipse 55% 45% at 90% 100%, oklch(0.723 0.192 149.6 / 20%), transparent 72%), linear-gradient(180deg, oklch(0.19 0.035 262), oklch(0.149 0.017 259.9))",
    accent: "oklch(0.637 0.208 25.3)",
    accent2: "oklch(0.723 0.192 149.6)",
  },
  {
    id: "minimal",
    name: "Minimal",
    tagline: "Quiet slate, no glow, all typography",
    mascot: "shield",
    atmosphere:
      "linear-gradient(180deg, oklch(0.26 0.012 258), oklch(0.19 0.008 258))",
    accent: "oklch(0.80 0.02 255)",
  },
  {
    id: "ember-noir",
    name: "Ember noir",
    tagline: "Near-black with a single molten highlight",
    mascot: "flame",
    atmosphere:
      "radial-gradient(ellipse 60% 45% at 50% 100%, oklch(0.68 0.19 42 / 40%), transparent 72%), linear-gradient(180deg, oklch(0.13 0.012 40), oklch(0.09 0.008 30))",
    accent: "oklch(0.72 0.18 42)",
  },
  {
    id: "aurora-mint",
    name: "Aurora mint",
    tagline: "Cool teal aurora, fresh and calm",
    mascot: "wave",
    atmosphere:
      "radial-gradient(ellipse 75% 55% at 20% 0%, oklch(0.75 0.16 170 / 38%), transparent 70%), radial-gradient(ellipse 60% 50% at 85% 90%, oklch(0.66 0.15 235 / 34%), transparent 72%), linear-gradient(180deg, oklch(0.18 0.03 200), oklch(0.13 0.02 210))",
    accent: "oklch(0.76 0.15 170)",
    accent2: "oklch(0.66 0.15 235)",
  },
  {
    id: "royal-violet",
    name: "Royal violet",
    tagline: "Deep plum with a gold-lit crown",
    mascot: "crown",
    atmosphere:
      "radial-gradient(ellipse 65% 50% at 50% 0%, oklch(0.55 0.20 300 / 42%), transparent 70%), radial-gradient(ellipse 50% 40% at 90% 100%, oklch(0.80 0.14 88 / 22%), transparent 72%), linear-gradient(180deg, oklch(0.18 0.05 300), oklch(0.12 0.03 300))",
    accent: "oklch(0.80 0.14 88)",
    accent2: "oklch(0.55 0.20 300)",
  },
  {
    id: "paper-light",
    name: "Paper light",
    tagline: "Bright daylight card on warm paper",
    mascot: "sparkle",
    atmosphere:
      "radial-gradient(ellipse 70% 50% at 50% 0%, oklch(0.92 0.03 250 / 90%), transparent 72%), linear-gradient(180deg, oklch(0.96 0.01 90), oklch(0.88 0.02 250))",
    accent: "oklch(0.52 0.16 258)",
  },
];

export const DEFAULT_BRAND_PRESET_ID = "fenrir-dark";

export function getBrandPreset(id?: string | null): GateBrandPreset {
  return (
    GATE_BRAND_PRESETS.find((p) => p.id === id) ??
    GATE_BRAND_PRESETS.find((p) => p.id === DEFAULT_BRAND_PRESET_ID)!
  );
}
