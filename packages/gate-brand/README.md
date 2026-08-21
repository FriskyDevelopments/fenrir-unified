# @frisky/gate-brand

Single source of truth for **Gate visual branding** — the preset `id / name / tagline / mascot / atmosphere / accent (+ optional accent2)` shared by:

- **Community Bridge** — `apps/community-bridge/src/lib/gate-presets.ts` (the real gate builder, Neon-backed).
- **MyFenrir visual lab** — `apps/fenrir-bridge` routes `/wow` and `/visual-lab`.

## Why this exists

The visual lab previously hard-copied preset colors from Community Bridge. Copies drift. This package makes the brand-visual fields **one definition** both apps import, so a color change in the gate is automatically reflected in the lab.

`accent` and `atmosphere` are copied **verbatim** from Community Bridge's `GATE_PRESETS`. `accent2` is the secondary hue already present in each preset's own atmosphere, surfaced so ambient glows can recolor coherently.

## What it is NOT

Deliberately excludes anything product/security: no logo URLs, overlays, thumbnails, `brandId`, Neon/auth wiring. Those stay in the consuming app. A gate animation is **never** authorization.

## Consumers

- `fenrir-bridge` imports it today via a Vite alias + tsconfig path (`@frisky/gate-brand`).
- `community-bridge` adoption is a separate, one-line-import change — see `ADOPT_IN_COMMUNITY_BRIDGE.md`. Not applied here to avoid touching in-flight Community Bridge work.
