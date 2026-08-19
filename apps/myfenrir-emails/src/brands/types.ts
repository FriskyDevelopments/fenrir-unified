// White-label brand model. One engine (dark, cosmic "Fenrir" look), many looks.
// MyFenrir is the default; community sub-brands can override colors/sender/footer
// inline via resolveBrand() without touching template code.

export interface BrandLink {
  label: string;
  url: string;
}

export interface BrandColors {
  ink: string;        // deepest void — body canvas + footer background
  inkAlt: string;     // panel / hero base
  surface: string;    // content card background (dark)
  surfaceAlt: string; // alternating row / muted panel
  border: string;     // hairlines / dividers (usually a translucent light)
  heading: string;    // brightest text (h1)
  body: string;       // paragraph text
  muted: string;      // secondary text
  faint: string;      // legal / micro text
  accent: string;     // PRIMARY accent — MyFenrir cyan (#00E5FF)
  accentSoft: string; // softer cyan glow (#4FD7E0)
  accentDark: string; // pressed / gradient partner of accent
  onAccent: string;   // text color on top of the cyan CTA (dark for contrast)
  purple: string;     // secondary accent — Fenrir amethyst (#8B7CFF)
  gold: string;       // tertiary "premium / dashboard" accent (#F1B75C)
  danger: string;     // error / security-alert accent
}

export interface BrandSender {
  name: string;      // display name, e.g. "MyFenrir"
  email: string;     // envelope from (must be on a verified sending domain)
  replyTo?: string;  // optional reply-to
}

export interface BrandFooter {
  legal?: string;              // legal line, e.g. "Fenrir Protocol · MyFenrir"
  address?: string;            // postal address line (optional)
  note?: string;               // small print (e.g. security disclaimer)
  links?: BrandLink[];         // wiki, portal, ayuda, etc.
  signoff?: string;            // "Enviado por MyFenrir · myfenrir.com"
}

export interface Brand {
  id: string;          // slug, e.g. "myfenrir"
  name: string;        // brand display name
  wordmark: string;    // text hero wordmark, e.g. "FENRIR"
  wordmarkDot?: boolean; // render the trademark dot after the wordmark
  tagline?: string;    // short line in the hero, e.g. "THE PACK"
  logoUrl?: string;    // OPTIONAL hosted logo (PNG). SVG is avoided (Gmail strips it).
  logoWidth?: number;  // rendered logo width in px (default 72)
  colors: BrandColors;
  sender: BrandSender;
  footer: BrandFooter;
  site?: string;           // public site url
  supportEmail?: string;   // shown in help copy
  fontStack?: string;      // optional override of the body font stack
}

// Premium default font stack (system fonts render everywhere; no web-font fetch).
export const DEFAULT_FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif,'Apple Color Emoji','Segoe UI Emoji'";

// Monospace stack for codes / IDs.
export const MONO_STACK =
  "'SFMono-Regular',ui-monospace,Consolas,'Liberation Mono',Menlo,monospace";
