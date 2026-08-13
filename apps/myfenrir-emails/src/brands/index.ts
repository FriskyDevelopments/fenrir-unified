import type { Brand } from "./types";
import { myfenrir } from "./myfenrir";

export type { Brand } from "./types";

// Registry of built-in brands. Add a community sub-brand by dropping a file here
// + one line, OR pass an inline brand object per request (see resolveBrand).
export const BRANDS: Record<string, Brand> = {
  [myfenrir.id]: myfenrir,
};

export const DEFAULT_BRAND_ID = "myfenrir";

// Resolve a brand for a request. Accepts:
//   - a brand id string (looked up in the registry), or
//   - a full/partial Brand object (deep-merged over the MyFenrir default), or
//   - undefined (returns MyFenrir default).
// This is what makes the system white-label: a community can pass a stored
// brand id OR an inline brand built from its own settings (colors, sender,
// footer) with no code change here.
export function resolveBrand(input?: string | Partial<Brand>): Brand {
  if (!input) return myfenrir;
  if (typeof input === "string") {
    return BRANDS[input] ?? myfenrir;
  }
  const base = (input.id && BRANDS[input.id]) || myfenrir;
  return {
    ...base,
    ...input,
    colors: { ...base.colors, ...(input.colors ?? {}) },
    sender: { ...base.sender, ...(input.sender ?? {}) },
    footer: {
      ...base.footer,
      ...(input.footer ?? {}),
      links: input.footer?.links ?? base.footer.links,
    },
  };
}
