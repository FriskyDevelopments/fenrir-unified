// Small formatting + safety helpers shared by all templates.

// Escape untrusted text before injecting into HTML.
export function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Human date in Spanish (es-MX) with time. Accepts ISO string or Date.
export function fecha(input?: string | Date, withTime = false): string {
  if (!input) return "";
  const d = typeof input === "string" ? new Date(input) : input;
  if (isNaN(d.getTime())) return esc(String(input));
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "long", year: "numeric" };
  if (withTime) {
    opts.hour = "2-digit";
    opts.minute = "2-digit";
  }
  return d.toLocaleDateString("es-MX", opts);
}

// Minutes-from-now helper for "expires in X" copy. Accepts an ISO expiry.
export function minutesUntil(iso?: string): number | undefined {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return undefined;
  return Math.max(0, Math.round((t - Date.now()) / 60000));
}

// Split a short verification code into evenly-spaced characters for display.
export function spacedCode(code: string): string {
  return String(code).trim().toUpperCase().split("").join(" ");
}

// Best-effort first name from an email or full name (for greetings).
export function firstName(nameOrEmail?: string): string {
  if (!nameOrEmail) return "";
  const s = String(nameOrEmail).trim();
  if (s.includes("@")) return s.split("@")[0].split(/[._-]/)[0].replace(/^\w/, (c) => c.toUpperCase());
  return s.split(/\s+/)[0];
}
