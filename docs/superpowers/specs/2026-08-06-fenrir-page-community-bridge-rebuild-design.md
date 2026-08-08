# Fenrir page rebuild on the Community Bridge structure — design

**Date**: 2026-08-06
**Request**: "reconstrúyeme toda la página de fenrir conforme a la reestructura del community bridge"
**Basis**: `COMMUNITY_GATE_ALIGNMENT_PLAN.md` (repo root, Aug 5 2026) + the actual Community Gate code at `~/Developer/community-gate/frontend`.

## Reality check that shaped this design

- `apps/fenrir-bridge` is **not** Tailwind-based (the plan assumed it was). It is a plain-CSS app: one 6.7k-line `src/styles/global.css` with semantic classes, consumed by a 4.9k-line `src/App.tsx`. Tailwind sits unwired in devDependencies.
- The Community Gate design system is, at its core, **runtime CSS-variable theming (HSL tokens) + protocol classes + canvas/SVG visual components**. That core ports cleanly to a plain-CSS app; the Tailwind utilities around it do not need to come along.
- Commit `6e50e6a` deliberately purged the LORE neon palette and locked MyFenrir to the FriskyDev **gold-over-ink** brand (`src/theme/brandThemes.ts` documents this). The rebuild therefore adopts the Community Gate **structure** with the **Fenrir gold/ink brand values** as the default theme — not the neon-green preset.
- `AuthSurface` props and all `App.tsx` call sites stay identical; Supabase login logic is untouched (standing rule: never re-cut login).

## What gets built

1. **Token layer** (`global.css`): a namespaced `--gate-*` HSL token set (`bg, surface, border, border-alpha, accent, accent-soft, glow, text, text-muted, gradient-start/middle/end`), defaulting to the Fenrir gold/ink palette expressed in HSL. Namespacing avoids colliding with the existing hex `--theme-accent` family that 6.7k lines of CSS already consume.
2. **Typography**: import Unbounded / Outfit / JetBrains Mono (the fonts the Community Gate actually ships — its `index.css` — not the Fraunces guess in the plan doc). Point the existing `--display` and `--mono` variables and the body font at them, so the entire app (dashboard included) adopts protocol typography with zero markup changes.
3. **Protocol classes** ported into `global.css`: `gate-card, neon-edge, neon-text, gate-input, gate-btn-primary, gate-btn-ghost, status-pill, scanline, glow-eye, font-display, font-mono-protocol`, the `drift / pulse-glow / slide-in-*` keyframes, and new `gate-*` layout classes for the split-pane shell.
4. **Components** ported as TSX into `src/components/gate/` (no react-router, no ThemeProvider — props + `--gate-*` vars instead): `ShaderBackground`, `ParticleField`, `WolfMascot`, `HowlMascot`, `BrandMark`, `StatusBadge`, `GateShell` (top brand bar + protocol footer chrome).
5. **AuthSurface rebuilt** as the Community Gate two-pane layout, same props/children contract:
   - background layers: `ShaderBackground` (kind mapped from `theme.background`: protocol→grid, nexus→shader, experimental→ember) + `ParticleField` + scanline overlay;
   - `GateShell` chrome: brand lockup top bar ("Community · Gate" microcopy) + protocol footer ("Status: protocol active");
   - visual pane: mono eyebrow (`authKicker`), display headline with gradient last word, subheadline, `StatusBadge` row, `WolfMascot`, protocol corner labels fed by `theme.lanes` / `theme.nodeStatus`;
   - auth pane: renders `children` untouched (the existing `GlowCard.auth-card` login cards keep their own styling and logic).
6. **`themeCssVars()`** in `brandThemes.ts` additionally emits the `--gate-*` tokens (hex→HSL-triplet conversion) so all three brand themes and the community brand wizard's runtime colors keep driving the new surface.

## What deliberately does NOT change

- App.tsx logic, routing, Supabase/OAuth flows, i18n, billing, Telegram — untouched.
- The dashboard's semantic markup: it inherits the rebuild through tokens + typography only.
- Old `.auth-page` atmosphere CSS stays in the file (dead but inert) to keep the diff auditable; cleanup can be a follow-up.

## Verification

`npm run build` + vitest suite in `apps/fenrir-bridge`, then dev-server preview with screenshots of the login gate (all three brand themes reachable) and the dashboard.
