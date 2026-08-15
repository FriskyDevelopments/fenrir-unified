export const LOCALES = ["en", "es", "fr", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Accepts app locales and Telegram language_code values such as es-MX/de-DE. */
export function resolveLocale(value: unknown): Locale {
  const code = String(value ?? "").trim().toLowerCase().replace("_", "-").split("-")[0];
  return (LOCALES as readonly string[]).includes(code) ? code as Locale : DEFAULT_LOCALE;
}
