# MyFenrir — audit fixes applied (2026-08-08)

Branch: `claude/audit-seo-csp-fixes` (continued). App: `apps/fenrir-bridge`
(Cloudflare **Pages**, project `fenrir-bridge`). Changes are **on disk /
uncommitted**, matching this branch's existing convention. Everything below was
built and verified locally; anything that needs Cloudflare (deploy, live curl)
could **not** run from the sandbox and is called out explicitly.

## Sandbox limitation (important, read first)
- Cloudflare dashboard + API are **blocked by the sandbox network allowlist**
  (`403 blocked-by-allowlist`); DNS is unreachable. So `myfenrir.com` could not
  be curled and **live verification was impossible** from here.
- `wrangler whoami` → **not authenticated**; `wrangler login` is interactive
  OAuth (needs a browser) → **no deploy possible from the sandbox**.
- Therefore: **no Pages preview deploy and no redirects-Worker deploy were
  performed.** Deploy + live curl are handed off below. Nothing was pushed to
  prod.

---

## 1) Redirects — `fenrir-redirects` Worker (authored, NOT deployed)
Files: `workers/fenrir-redirects/{worker.js, wrangler.toml, README.md}`
(Francisco's code, verbatim). Logic unit-verified in Node:

| request | result |
|---|---|
| `http://myfenrir.com/wiki?x=1` | `301 → https://myfenrir.com/wiki?x=1` (query preserved) |
| `http://www.myfenrir.com/a?b=2` | `301 → https://www.myfenrir.com/a?b=2` |
| `https://myfenrir.com/pricing?ref=z` | `301 → https://www.myfenrir.com/pricing?ref=z` |
| `https://www.myfenrir.com/api/auth/me` | passthrough `200` (origin intact) |

`wrangler deploy --dry-run --config ./wrangler.toml` bundles clean (0.47 KiB).

### ⚠️ Canonical direction — CONFLICT, needs Francisco's call
The Worker redirects **apex → www**, but the repo canonicalizes on the **APEX**:
`index.html` `<link rel=canonical>` + `og:url` = `https://myfenrir.com/`,
`wrangler.jsonc` `PUBLIC_SITE_URL = https://myfenrir.com`. Meanwhile Supabase
auth defaults its redirect origin to **www** (`supabaseAuth.ts`). So the signals
are mixed. Pick one and make all agree (details + one-line flip in the Worker
README). **Do not ship apex→www while the canonical tag still says apex.**

### ⚠️ Pre-activation (or you can take the site down)
The Worker binds routes on BOTH hostnames, intercepting 100% of prod traffic.
Before deploying apex→www, confirm `www.myfenrir.com` already serves the Pages
origin (custom domain/DNS in Cloudflare). If www is NOT wired to Pages, do NOT
deploy apex→www — deploy the HTTPS-only variant and tell Francisco.

### Deploy + verify (manual, from an authed machine)
```bash
cd apps/fenrir-bridge/workers/fenrir-redirects
env -u CLOUDFLARE_API_TOKEN npx wrangler@4 login
env -u CLOUDFLARE_API_TOKEN npx wrangler@4 deploy
curl -sSI http://myfenrir.com/ ; curl -sSI https://myfenrir.com/ ; curl -sSI https://www.myfenrir.com/
```
"Always Use HTTPS" (SSL/TLS → Edge Certificates) stays a **dashboard toggle** —
Francisco's action, zero cost. Hybrid option: enable that toggle and delete the
`http:` block so the Worker only does apex↔www.

---

## 2) CSP — tightened (`public/_headers`, `/*` policy)
Replaced the root CSP. **Verified PostHog region from code**
(`src/services/posthog.ts`): default host `https://us.i.posthog.com`, overridable
by `VITE_POSTHOG_HOST`; **no EU** anywhere → EU hosts intentionally **omitted**
(the brief listed eu/us; only us is real). Supabase host confirmed
`https://yqevglppbhuoxxfsfnih.supabase.co`.

Correction vs. the brief: `posthog-js` lazy-loads its session-replay / exception
extensions as **scripts** from `us-assets.i.posthog.com`. The brief only added
PostHog to `connect-src`; that would have silently killed session replay (which
the code relies on for the login-loop diagnosis). So `us-assets.i.posthog.com`
is added to **both** `script-src` and `connect-src`:

```
default-src 'self'; script-src 'self' https://static.cloudflareinsights.com https://us-assets.i.posthog.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://web-platforms.sfo2.cdn.digitaloceanspaces.com; object-src 'none'; connect-src 'self' https://yqevglppbhuoxxfsfnih.supabase.co https://cloudflareinsights.com https://us.i.posthog.com https://us-assets.i.posthog.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests
```
(The separate `/activation` CSP blocks were left as-is — that flow is standalone
static HTML and does not run PostHog.)

---

## 3a) theme-color — fixed to the real landing accent (cyan)
`#ff1744` (red) → **`#00e5ff`** in `index.html` and `site.webmanifest`.
Verified source: the live landing `src/components/CinematicLanding.tsx` defines
`--cyan: #00e5ff` as its primary accent — that is the cyan Francisco meant.
Note: the **dashboard** surface is gold (`#c2a469`, FriskyDev palette); the CSS
explicitly says the old neon set was removed as "LORE contamination", so no
neon-lime was introduced. If Francisco prefers theme-color to match the gold
dashboard instead of the cyan landing, it's a one-line change.

## 3b) Perf — code-split, measured
`main.tsx → App.tsx` statically pulled PostHog, Supabase and WebAuthn into one
chunk. Now deferred via dynamic `import()`:
- **PostHog** (`main.tsx`): loaded on idle (`requestIdleCallback`), no-op without
  token — unchanged behavior, just off the critical path.
- **Supabase** (`services/supabaseAuth.ts`): `@supabase/supabase-js` now a
  type-only import; `createClient` lazy-loaded inside the (now async) client
  factory. Sync helpers stay dependency-free; landing never pulls it.
- **WebAuthn** (`App.tsx`, `routes/authGate.tsx`, `routes/DashboardRoute.tsx`):
  `@simplewebauthn/browser` imported at the passkey call sites only.

**Measured initial JS on the landing (real `vite build`):**

| | before | after | Δ |
|---|--:|--:|--:|
| entry JS (raw) | 903.45 kB | **450.98 kB** | −452 kB (−50.1%) |
| entry JS (gzip) | 274.93 kB | **139.47 kB** | −135 kB (−49.3%) |

Deferred into lazy chunks (loaded only when needed): `posthog` 242 kB, `supabase`
205 kB, `webauthn` 9 kB. `tsc --noEmit` clean; `vitest run` 28/28 pass; no
`modulepreload` of the heavy chunks (confirmed truly deferred).
> The brief's "~429 KB" was stale — the real pre-fix bundle was 903 kB raw /
> 275 kB gzip. Reporting the measured numbers.

## 4) Legal — static pages (`/privacy`, `/terms`, `/legal`)
These previously served only the SPA shell (content rendered by a lazy
`LegalPage` component → empty for crawlers/social). Added self-contained static
HTML at `public/{privacy,terms,legal}/index.html`, using the app's **real** legal
copy (`i18n` `legal*Body`), each with its own `<title>`/description/canonical,
`robots: index,follow`, cyan `theme-color`, no external requests (CSP-safe), and
a link back to the app. Distinct content per URL (privacy / terms+AUP+payments /
full hub) to avoid duplicate-content. `_redirects` gains explicit `/privacy`,
`/terms`, `/legal` → static rewrites before the `/* → index.html` SPA fallback.
(`/acceptable-use` left to the SPA — not in scope.)

---

## Build / deploy status
- `vite build` (full, with all changes): **clean**; legal pages, `_headers`,
  `_redirects` all present in output; theme-color + CSP shipped.
- Pages **preview deploy**: **NOT possible from sandbox** (no CF network / no
  wrangler auth). Run from an authed machine:
  `env -u CLOUDFLARE_API_TOKEN npx wrangler@4 pages deploy dist --project-name fenrir-bridge --branch <preview-name>`
  (any branch ≠ the production branch gives a unique preview URL; prod untouched).
- No secrets added to git. Changes left uncommitted on disk (branch convention).
- Sandbox-only note: Linux `@rollup`/`@esbuild` arm64 binaries were added to
  `node_modules` with `--no-save` so the build could run here; harmless
  alongside the macOS binaries and absent from `package.json`.
