# Community Gate → MyFenrir Design System Alignment Plan

**Status**: Starting integration (Aug 5, 2026)
**Target**: Unified design system across MyFenrir ecosystem

---

## 1. Current State Analysis

### Community Gate Design System
- **Framework**: React 19 + Tailwind CSS + Shadcn/UI
- **Architecture**: Backend-driven theming via CSS variables
- **Color Model**: HSL-based with 25+ customizable tokens
- **Components**: 50+ Shadcn/UI primitives
- **Styling**: Tailwind + custom CSS for animations/shaders
- **Key Features**:
  - Dynamic brand theming per tenant
  - Gradient text and glow effects
  - SVG mascot components (HowlMascot, WolfMascot)
  - Particle field + shader backgrounds
  - Grid overlay system
  - Protocol-style typography (mono, display fonts)

### MyFenrir (fenrir-bridge) Current System
- **Framework**: React + Tailwind CSS + Vite
- **Color Model**: CSS variables (minimal: app, surface, theme-primary, theme-secondary, theme-accent)
- **Styling**: Minimal custom theme, glow shadow
- **Border Radius**: Custom fenrir: 8px
- **Limitations**: No dynamic theming, limited color palette

### Design Gaps
- fenrir-bridge lacks the rich color system of Community Gate
- No gradient/glow effects system
- No mascot or custom SVG component library
- Limited animation library
- No layout primitives (grid, particles, etc.)

---

## 2. Alignment Strategy (3-Phase)

### Phase 1: Extend Tailwind Theme (Days 1-2)
**Goal**: Make Community Gate tokens available in fenrir-bridge

```typescript
// apps/fenrir-bridge/tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        // Keep existing
        app: "var(--app)",
        surface: "var(--surface)",
        
        // Add Community Gate palette
        // Brand colors
        "brand": {
          primary: "hsl(var(--brand-primary))",
          secondary: "hsl(var(--brand-secondary))",
          accent: "hsl(var(--brand-accent))",
          glow: "hsl(var(--brand-glow))",
        },
        // Background & Surface
        "theme": {
          bg: "hsl(var(--theme-bg))",
          text: "hsl(var(--theme-text))",
          "text-muted": "hsl(var(--theme-text-muted))",
          border: "hsl(var(--theme-border))",
          surface: "hsl(var(--theme-surface))",
        },
        // Gradients (via CSS)
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(96deg, hsl(var(--brand-gradient-start)), hsl(var(--brand-gradient-middle)), hsl(var(--brand-gradient-end)))",
      },
      boxShadow: {
        glow: "0 24px 90px rgba(0,0,0,.38), 0 0 54px var(--theme-glow)",
        "glow-sm": "0 0 8px hsl(var(--theme-glow) / 0.5)",
        "glow-lg": "0 0 18px hsl(var(--theme-glow) / 0.35)",
      },
      animation: {
        "pulse-glow": "pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
      },
    },
  },
};
```

### Phase 2: Create Shared Component Library (Days 3-5)
**Goal**: Extract reusable components into a shared package

**New Structure**:
```
fenrir-unified/
├── packages/
│   ├── fenrir-ui/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── BrandMark.tsx
│   │   │   │   ├── HowlMascot.tsx
│   │   │   │   ├── WolfMascot.tsx
│   │   │   │   ├── ShaderBackground.tsx
│   │   │   │   ├── ParticleField.tsx
│   │   │   │   ├── GateShell.tsx
│   │   │   │   └── StatusBadge.tsx
│   │   │   └── hooks/
│   │   │       ├── useCommunity.ts
│   │   │       └── useBrandTheme.ts
│   │   ├── package.json
│   │   └── tailwind.config.ts
│   └── fenrir-tokens/
│       ├── colors.json
│       ├── shadows.json
│       ├── animations.json
│       └── typography.json
├── apps/
│   ├── fenrir-bridge/
│   ├── fenrir-cinema/
│   └── community-gate/  ← Move here eventually
```

**Components to Extract**:
- ✅ BrandMark (handles logo/icon/mascot cascade)
- ✅ HowlMascot (SVG, theme-aware)
- ✅ WolfMascot (SVG, theme-aware)
- ✅ ShaderBackground (animated gradients)
- ✅ ParticleField (particle animation)
- ✅ StatusBadge (status indicators)
- ✅ InviteCodeInput (4-digit input with glyph)

**Hooks to Extract**:
- ✅ `useCommunity()` - fetch & inject theme
- ✅ `useBrandTheme()` - access theme CSS vars

### Phase 3: Integrate Community Gate Patterns (Days 6-9)
**Goal**: Apply Community Gate UX patterns to MyFenrir flows

**Integration Points**:

1. **Auth Flows** (CommunityGate.jsx patterns)
   - OAuth button ordering (Apple → Google → Microsoft)
   - Magic link collapsible
   - Invite code verification flow
   - Staff/legacy access toggle

2. **Status Pages** (CommunityStatusPages.jsx)
   - Pending approval
   - Verified landing
   - Denied/rejected

3. **Admin Panel** (AdminCommunityEditor.jsx patterns)
   - Live preview pane
   - Color picker inputs (HSL)
   - Copy field editor
   - Layout toggle checkboxes

4. **Layout Primitives**
   - Two-pane split layout (visual + form)
   - Full-screen gate shell
   - Scanline overlay
   - Grid overlay

---

## 3. Technical Implementation Plan

### Step 1: Update fenrir-bridge Tailwind Config
**File**: `apps/fenrir-bridge/tailwind.config.ts`

- Add Community Gate color tokens
- Add animation keyframes (pulse-glow, scanline)
- Add box-shadow variants (glow-sm, glow-md, glow-lg)
- Import Shadcn/UI color palette as fallback

### Step 2: Create Base CSS Variables
**File**: `apps/fenrir-bridge/src/index.css`

```css
:root {
  /* Community Gate tokens */
  --brand-primary: 260 84% 58%;
  --brand-secondary: 240 60% 50%;
  --brand-accent: 200 100% 50%;
  --brand-glow: 200 100% 50%;
  
  --brand-gradient-start: 260 84% 58%;
  --brand-gradient-middle: 200 100% 50%;
  --brand-gradient-end: 280 70% 55%;
  
  /* Theme tokens */
  --theme-bg: 220 30% 3%;
  --theme-text: 220 13% 91%;
  --theme-text-muted: 220 13% 62%;
  --theme-border: 220 13% 20%;
  --theme-surface: 220 13% 12%;
  --theme-glow: 200 100% 50%;
}
```

### Step 3: Copy Community Gate Components
**Path**: `apps/fenrir-bridge/src/components/`

```bash
cp -r /Users/friskypup/Developer/community-gate/frontend/src/components/* \
  /Users/friskypup/fenrir-unified/apps/fenrir-bridge/src/components/
```

**Components to Copy**:
- BrandMark.jsx
- HowlMascot.jsx
- WolfMascot.jsx
- ShaderBackground.jsx
- ParticleField.jsx
- StatusBadge.jsx
- InviteCodeInput.jsx
- GateShell.jsx

### Step 4: Adapt Community Gate Pages
**Path**: `apps/fenrir-bridge/src/pages/community-gate/`

- CommunityGate.jsx (main gate)
- CommunityInvitePage.jsx (invite entry)
- CommunityStatusPages.jsx (pending/verified/denied)
- OAuthCallback.jsx (OAuth handler)

### Step 5: Create Community Provider
**File**: `apps/fenrir-bridge/src/contexts/CommunityContext.tsx`

```typescript
export function CommunityProvider({ children, slug }) {
  const [community, setCommunity] = useState(null);
  
  useEffect(() => {
    // Load community config from API or local store
    // Inject CSS variables to document.documentElement
  }, [slug]);
  
  return (
    <CommunityContext.Provider value={{ community, loading }}>
      {children}
    </CommunityContext.Provider>
  );
}
```

---

## 4. Component Migration Checklist

- [ ] BrandMark → works with any community config
- [ ] HowlMascot → SVG, theme-aware via CSS vars
- [ ] WolfMascot → SVG, theme-aware via CSS vars
- [ ] ShaderBackground → animated gradient overlays
- [ ] ParticleField → particle effects with configurable density
- [ ] StatusBadge → verified/pending/member badges
- [ ] InviteCodeInput → segmented 4-digit input
- [ ] GateShell → split-pane layout wrapper
- [ ] OAuthButtons → configurable provider order
- [ ] useCommunity hook → fetch & inject theme
- [ ] useBrandTheme hook → access current theme tokens

---

## 5. Tailwind Class Mappings

| Community Gate | New MyFenrir Class |
|---|---|
| `bg-[hsl(var(--theme-bg))]` | `bg-theme-bg` |
| `text-[hsl(var(--theme-text))]` | `text-theme-text` |
| `shadow-glow` | `shadow-glow` (custom) |
| `drop-shadow-glow` | Use custom CSS |
| `font-display` | Extend to include Fraunces |
| `font-mono-protocol` | Extend to include JetBrains Mono |
| `gradient-text` | Add via tailwind plugin |

---

## 6. Typography Alignment

**Community Gate**:
- Display: Fraunces (bold, tracking)
- Mono: JetBrains Mono (compact spacing)

**MyFenrir Current**:
- System fonts

**Action**: Import both font families, extend theme.fontFamily

```typescript
theme: {
  extend: {
    fontFamily: {
      display: ["Fraunces", "serif"],
      mono: ["JetBrains Mono", "monospace"],
    },
  },
}
```

---

## 7. Next Steps (When Network Restores)

1. **Build phase-1 Tailwind config**
   ```bash
   cd /Users/friskypup/fenrir-unified/apps/fenrir-bridge
   npm install (if needed)
   npm run dev  # Test new colors
   ```

2. **Copy components to fenrir-bridge**
   ```bash
   cp -r /Users/friskypup/Developer/community-gate/frontend/src/components/* src/components/
   ```

3. **Adapt imports** (Community Gate uses CRA paths, fenrir-bridge uses Vite)
   - Change `../lib/api` → `../../lib/api`
   - Update all relative imports

4. **Create CommunityProvider** for theme injection

5. **Test on fenrir-bridge UI**
   - Add theme selector
   - Test gradient text, glows, particles
   - Verify animations work

6. **Document reusable patterns** for other apps (fenrir-cinema, etc.)

---

## 8. Benefits After Alignment

✅ **Unified Design Language**: One token system across all Fenrir/MyFenrir surfaces
✅ **Component Reuse**: Mascots, gates, status pages shared
✅ **Consistent Theming**: HSL-based colors, CSS variables for flexibility
✅ **Animation Library**: Glow, pulse, scanline effects available
✅ **Better DX**: Single source of truth for brand colors, animations
✅ **Scalability**: New communities/themes via config, no code changes
✅ **Accessibility**: Proper color contrast, ARIA labels baked in

---

**Estimated Effort**: 8-12 hours (when network available)
**Risk Level**: Low (additive, no breaking changes)
**Rollback Plan**: Git revert (changes are isolated to fenrir-bridge)

