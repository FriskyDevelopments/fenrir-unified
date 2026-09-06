# Phase 2 — Shared Component Library

**Status**: scaffolded overnight (2026-09-02)
**Depends on**: Phase 1 tokens (tailwind.config.ts + index.css)

## What landed

- `useBrandTheme.ts` — reads active brand, injects `--gate-*` CSS vars at runtime
- `useCommunity.ts` — fetches community config (falls back gracefully), wires brand
- `CommunityProvider.tsx` — context so any gate child can read theme + community
- `GateDemo.tsx` — smoke-test page rendering every primitive under the active theme

## Primitives already in tree (ported earlier)

- `BrandMark`, `HowlMascot`, `WolfMascot`
- `ShaderBackground`, `ParticleField`
- `StatusBadge`, `GateShell`
- barrel `index.ts`

## Still TODO

- [ ] InviteCodeInput (4-digit segmented input)
- [ ] OAuthButtons (configurable provider order)
- [ ] CommunityGate page wiring (replace placeholder routes)
- [ ] Theme selector UI in admin
- [ ] Extract to `packages/fenrir-ui` shared package

## How to preview

```bash
cd apps/fenrir-bridge
npm run dev
# mount <GateDemo /> at /gate-demo (or import in a route)
```

All components consume `--gate-*` HSL tokens, so swapping `brandThemes` recolors everything.
