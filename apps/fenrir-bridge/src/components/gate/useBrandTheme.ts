import { useEffect, useState } from "react";
import { brandThemes, type BrandKey, type BrandTheme, themeCssVars } from "../../theme/brandThemes";

/**
 * useBrandTheme — reads the active brand theme and exposes the CSS var map.
 * Ported from community-gate useBrandTheme hook, adapted to fenrir-bridge.
 */
export function useBrandTheme(initial: BrandKey = "fenrir") {
  const [key, setKey] = useState<BrandKey>(initial);
  const theme: BrandTheme = brandThemes[key];

  useEffect(() => {
    const root = document.documentElement;
    const vars = themeCssVars(theme);
    for (const [k, v] of Object.entries(vars)) {
      root.style.setProperty(k, String(v));
    }
    root.dataset.brand = key;
  }, [key, theme]);

  return { theme, key, setKey, themes: Object.keys(brandThemes) as BrandKey[] };
}
