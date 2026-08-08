/**
 * Tiny sRGB ⇄ OKLCH conversion so the theme editor can offer a native color
 * swatch while still storing brand tokens in the OKLCH form the design system
 * uses. No dependencies, no color library.
 */

function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** "#rrggbb" → "oklch(L C H)" with 3/3/1 decimals. */
export function hexToOklch(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const int = parseInt(m[1]!, 16);
  const r = srgbToLinear(((int >> 16) & 255) / 255);
  const g = srgbToLinear(((int >> 8) & 255) / 255);
  const b = srgbToLinear((int & 255) / 255);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m2 = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * m2 - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m2 + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m2 - 0.808675766 * s;

  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;

  const round = (v: number, d: number) => Number(v.toFixed(d));
  return `oklch(${round(L, 3)} ${round(C, 3)} ${round(H, 1)})`;
}

/** "oklch(L C H)" (or a hex string) → "#rrggbb" for the swatch input. */
export function oklchToHex(value: string): string | null {
  const raw = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();

  const m = /^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?/i.exec(raw);
  if (!m) return null;

  const num = (t: string, pctScale: number) =>
    t.endsWith("%") ? (parseFloat(t) / 100) * pctScale : parseFloat(t);
  const L = num(m[1]!, 1);
  const C = num(m[2]!, 0.4);
  const H = (parseFloat(m[3]!) * Math.PI) / 180;
  if (![L, C, H].every(Number.isFinite)) return null;

  const A = Math.cos(H) * C;
  const B = Math.sin(H) * C;

  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m2 = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;

  const r = linearToSrgb(clamp01(4.0767416621 * l - 3.3077115913 * m2 + 0.2309699292 * s));
  const g = linearToSrgb(clamp01(-1.2684380046 * l + 2.6097574011 * m2 - 0.3413193965 * s));
  const b = linearToSrgb(clamp01(-0.0041960863 * l - 0.7034186147 * m2 + 1.707614701 * s));

  const hex = (v: number) =>
    Math.round(clamp01(v) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
