# Adopting `@frisky/gate-brand` in Community Bridge

> **NOT APPLIED in this PR.** Community Bridge has in-flight uncommitted work.
> Apply this only once that branch has landed, on a clean tree.

Goal: make `apps/community-bridge/src/lib/gate-presets.ts` build its `GATE_PRESETS`
from the shared source of truth instead of holding its own copy of colors.

## 1. Resolve the alias (same pattern fenrir-bridge already uses)

**`apps/community-bridge/vite.config.ts`** — add to `resolve.alias`:

```ts
"@frisky/gate-brand": path.resolve(import.meta.dirname, "../../packages/gate-brand/src/presets.ts"),
```

**`apps/community-bridge/tsconfig.json`** — under `compilerOptions` add (Community
Bridge already uses `@/*`, so keep both):

```jsonc
"paths": {
  "@/*": ["./src/*"],
  "@frisky/gate-brand": ["../../packages/gate-brand/src/presets.ts"]
}
```

If the dev server blocks reads outside the app root, add
`server.fs.allow: ["..", "../../packages"]`.

## 2. Layer product fields on top of the shared branding

In `gate-presets.ts`, replace the hand-maintained visual fields (`accent`,
`atmosphere`, `name`, `tagline`, `mascot`) with values pulled from the shared
set, and keep the Community-Bridge-only fields (`logoUrl`, `overlay`, `thumb`,
`brandId`) local:

```ts
import { GATE_BRAND_PRESETS, getBrandPreset, type MascotKey } from "@frisky/gate-brand";

export interface GatePreset extends /* shared visual */ {
  id: string; name: string; tagline: string; mascot: MascotKey;
  atmosphere: string; accent: string; accent2?: string;
  // product-only, stay here:
  logoUrl: string; overlay: string; thumb: string; brandId: string;
}

const PRODUCT: Record<string, Pick<GatePreset, "logoUrl" | "overlay" | "thumb" | "brandId">> = {
  "lore-neon":   { logoUrl: DEFAULT_LOGO_URL, overlay: "…", thumb: "…", brandId: "lore" },
  // …one row per preset id, carrying over today's overlay/thumb/brandId values…
};

export const GATE_PRESETS: GatePreset[] = GATE_BRAND_PRESETS.map((b) => ({
  ...b,
  ...PRODUCT[b.id],
}));
```

`getPreset`, `DEFAULT_GATE`, and every downstream consumer keep working unchanged
(`accent` / `atmosphere` names are identical). `accent2` is additive and ignored
by anything that doesn't read it.

## 3. Verify

```
cd apps/community-bridge && <typecheck> && <test> && <build>
```

Nothing about auth, Neon, admission, or routing changes — this is visual config only.
