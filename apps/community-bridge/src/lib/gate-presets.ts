/**
 * Visual presets for the Public Gate Builder.
 *
 * Every preset is fully self-contained: logo, mascot and background/atmosphere
 * are bundled, so a brand-new gate looks great with ZERO configuration.
 */

export const DEFAULT_LOGO_URL = "/fenrir-cut-wordmark.svg";

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
    overlay: "linear-gradient(180deg, oklch(0.12 0.04 285 / 72%), oklch(0.10 0.03 275 / 92%))",
    thumb:
      "radial-gradient(circle at 30% 20%, oklch(0.68 0.24 320 / 70%), transparent 60%), radial-gradient(circle at 75% 80%, oklch(0.72 0.19 200 / 60%), transparent 60%), linear-gradient(160deg, oklch(0.18 0.05 285), oklch(0.11 0.03 275))",
    brandId: "lore",
  },
  {
    /*
     * Paleta tomada de pupfrisky.com, no inventada. La página la declara ella
     * misma —"Hazard yellow · Electric cyan · Neon amethyst"— sobre un
     * `meta-theme-color: #121212`, y el cian es verificable: `#00e5ff` es el
     * color literal que pasa a su reproductor de SoundCloud.
     *
     * Es el preset más ruidoso del set a propósito. El resto de los Gates
     * asumen una marca sobria; este asume lo contrario: amarillo de peligro
     * como acento, cian eléctrico entrando por abajo, amatista arriba, y negro
     * casi puro de fondo para que los tres neones corten. Tres focos en vez de
     * dos, que es lo que le da el brillo de arcade.
     *
     * brandId queda en "myfenrir" porque NO existe un tenant `pupfrisky`
     * —comprobado: cero coincidencias en src/—. Crear el tenant es un cambio
     * de datos aparte; este preset sólo aporta el aspecto.
     */
    id: "pup-hazard",
    name: "Pup hazard",
    tagline: "Hazard yellow, electric cyan, neon amethyst — hood up",
    logoUrl: DEFAULT_LOGO_URL,
    mascot: "wolf",
    atmosphere:
      "radial-gradient(ellipse 72% 55% at 50% 0%, oklch(0.65 0.23 305 / 42%), transparent 70%), radial-gradient(ellipse 62% 48% at 12% 100%, oklch(0.84 0.14 202 / 40%), transparent 72%), radial-gradient(ellipse 45% 38% at 88% 88%, oklch(0.88 0.18 96 / 26%), transparent 70%), linear-gradient(180deg, oklch(0.19 0.01 285), oklch(0.13 0.005 280))",
    accent: "oklch(0.88 0.18 96)",
    overlay: "linear-gradient(180deg, oklch(0.13 0.008 285 / 70%), oklch(0.11 0.004 280 / 94%))",
    thumb:
      "radial-gradient(circle at 28% 18%, oklch(0.65 0.23 305 / 72%), transparent 60%), radial-gradient(circle at 78% 82%, oklch(0.84 0.14 202 / 62%), transparent 60%), radial-gradient(circle at 52% 55%, oklch(0.88 0.18 96 / 40%), transparent 55%), linear-gradient(160deg, oklch(0.20 0.012 285), oklch(0.12 0.005 280))",
    brandId: "myfenrir",
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
    atmosphere: "linear-gradient(180deg, oklch(0.26 0.012 258), oklch(0.19 0.008 258))",
    accent: "oklch(0.80 0.02 255)",
    overlay: "linear-gradient(180deg, oklch(0.20 0.01 258 / 78%), oklch(0.17 0.008 258 / 94%))",
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
    overlay: "linear-gradient(180deg, oklch(0.10 0.01 35 / 76%), oklch(0.08 0.008 30 / 95%))",
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
    overlay: "linear-gradient(180deg, oklch(0.14 0.02 200 / 72%), oklch(0.11 0.015 210 / 94%))",
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
    overlay: "linear-gradient(180deg, oklch(0.14 0.04 300 / 74%), oklch(0.10 0.03 300 / 94%))",
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
    overlay: "linear-gradient(180deg, oklch(0.20 0.02 258 / 55%), oklch(0.16 0.015 258 / 85%))",
    thumb:
      "radial-gradient(circle at 30% 20%, oklch(0.99 0.01 90), transparent 60%), linear-gradient(160deg, oklch(0.96 0.01 90), oklch(0.86 0.03 250))",
    brandId: "clipsflow",
  },
];

export const DEFAULT_PRESET_ID = "fenrir-dark";

export function getPreset(id: string | null | undefined): GatePreset {
  return (
    GATE_PRESETS.find((p) => p.id === id) ?? GATE_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!
  );
}

export interface GateConfig {
  slug: string;
  preset: string;
  headline: string;
  subheadline: string;
  logo_url: string | null;
  mascot_url: string | null;
  background_url: string | null;
}

/*
 * Copy por defecto de un Gate recién creado.
 *
 * Sólo afecta a Gates NUEVOS y a la vista previa del editor: los existentes
 * guardan su headline y subheadline en `cb_gate_configs`, y esos no se tocan.
 * Nada se reescribe por debajo a nadie.
 *
 * El subtítulo decía "Sign in to continue to the portal." — lenguaje de
 * infraestructura, y "portal" no es una palabra que use ninguna comunidad para
 * hablar de sí misma. El resto de la página ya tiene el tono correcto ("Your
 * group isn't the front door. Community Gate is."); el default iba por detrás.
 * El nuevo describe lo que de verdad pasa —una verificación, y la sala sigue
 * privada— sin prometer nada que el producto no cumpla.
 */
export const DEFAULT_GATE: Omit<GateConfig, "slug"> = {
  preset: DEFAULT_PRESET_ID,
  headline: "Members only",
  subheadline: "Verify once. The room stays private.",
  logo_url: null,
  mascot_url: null,
  background_url: null,
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
