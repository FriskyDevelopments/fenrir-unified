/**
 * Núcleo de i18n del Community Bridge.
 *
 * CANON: el producto es multilingüe y **el inglés es la base**. Eso no es una
 * preferencia de orden: está expresado en el sistema de tipos. `defineCopy`
 * infiere la forma del diccionario a partir de `en`, así que cualquier otro
 * idioma que a) omita una clave, b) añada una que el inglés no tenga, o
 * c) cambie un tipo, **no compila**. Un idioma incompleto no puede llegar a
 * producción por descuido.
 *
 * Por qué un objeto tipado y no react-i18next: el chequeo de claves ocurre en
 * compilación, no en runtime, y no arrastra contexto asíncrono ni carga extra
 * en el camino del miembro. El patrón ya funciona en fenrir-bridge.
 *
 * Lección de fenrir-bridge que NO repetimos: allá conviven `src/i18n.ts` (1124
 * líneas) y `src/app/uiCopy.ts` (730), con cadenas duplicadas entre los dos —
 * el mismo `proCustomizationBody` estaba en ambos y divergió. Aquí hay un
 * módulo por dominio y una sola fuente de cada cadena.
 */

export const LOCALES = ["en", "es", "fr", "de"] as const;
export type Locale = (typeof LOCALES)[number];

/** El inglés es la base: es el fallback y la fuente de la forma del tipo. */
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
};

/**
 * Diccionario de un dominio. **El inglés va como primer argumento a propósito.**
 *
 * En un solo objeto —`defineCopy({ en, es, fr, de })`— TypeScript infiere `T`
 * a partir de TODAS las ramas a la vez y acaba eligiendo la más pequeña, así
 * que un idioma al que le falte una clave compila igual. Lo comprobé con una
 * prueba negativa: el caso incompleto pasaba sin error.
 *
 * Con `en` como primer parámetro, `T` se infiere SÓLO del inglés y el resto se
 * valida contra esa forma. Un idioma incompleto, con una clave de más o con un
 * tipo distinto, **no compila**. Eso es "el inglés es la base" expresado en el
 * sistema de tipos, no en un comentario.
 *
 *   export const copy = defineCopy(
 *     { title: "Members only" },
 *     { es: { title: "Sólo miembros" }, fr: {...}, de: {...} },
 *   );
 */
export function defineCopy<T extends Record<string, string>>(
  en: T,
  rest: Record<Exclude<Locale, "en">, { [K in keyof T]: string }>,
): Record<Locale, T> {
  return { en, ...rest } as Record<Locale, T>;
}

/**
 * Normaliza cualquier cosa —`navigator.language`, `?lang=`, un header— a un
 * locale soportado. Nunca lanza: lo desconocido cae al inglés, que es la base.
 */
export function normalizeLocale(value: string | null | undefined): Locale {
  const normalized = (value ?? "").toLowerCase().slice(0, 2);
  return (LOCALES as readonly string[]).includes(normalized)
    ? (normalized as Locale)
    : DEFAULT_LOCALE;
}

/**
 * Locale inicial del visitante, sin estado de servidor. Prioridad: `?lang=`
 * explícito, luego el idioma del navegador, luego inglés. Devuelve
 * DEFAULT_LOCALE en SSR para que el HTML servido y la primera pintura del
 * cliente coincidan; sin esto React reporta hydration mismatch.
 */
export function detectLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const requested = new URLSearchParams(window.location.search).get("lang");
  if (requested) return normalizeLocale(requested);
  return normalizeLocale(window.navigator.language);
}
