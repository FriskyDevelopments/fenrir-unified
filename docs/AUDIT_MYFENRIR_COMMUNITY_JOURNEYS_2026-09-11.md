# Audit — MyFenrir + Community journeys (2026-09-11)

Scope: `apps/fenrir-bridge` (MyFenrir / live myfenrir.com), `apps/community-bridge` + Community Gate flows inside fenrir-bridge.  
Method: code-path review of the existing checkout plus live HTTP probes. **No invented metrics.** Live checks are qualitative (status codes / JSON shape only).

Live probes (2026-09-11, UTC):

| URL | Result |
| --- | --- |
| `https://myfenrir.com/` | HTTP 200, strong CSP/HSTS |
| `https://myfenrir.com/login` | HTTP 200 |
| `https://myfenrir.com/main` | HTTP 200 (shell; auth gates data) |
| `https://myfenrir.com/api/auth/me` | `{ ok: true, authenticated: false }` |
| `https://community.myfenrir.com/` | HTTP 200 |
| `https://community.myfenrir.com/dashboard` | HTTP 200 (SPA shell) |

`/api/readiness` returned `{ ok: false, error: "authentication_required" }` for an anonymous request — treat readiness as authenticated-operator surface, not a public health endpoint.

---

## Journey maps

### A. Anonymous visitor — MyFenrir

```
/  → cinematic landing
   → /login (OAuth / passkey / Telegram widget / human verification)
   → public /room/:slug, /join/:slug, /vault, legal pages
```

**Observed:** Landing and login shells return 200. Anonymous `/api/auth/me` correctly reports unauthenticated. Public room resolution (post-DNS release) requires exact host + verified ownership + active HTTPS — unproven hosts do not resolve.

**P0:** none observed on anonymous shell.  
**P1:** dual dashboard surfaces (`App.tsx` live entry vs legacy `DashboardRoute.tsx`) create drift risk for operators.  
**P2:** IA previously exposed 12 nav items (links/faq/brands/revocations/dns separate).

**Fixed this PR:** consolidated operator IA to Command · Domains+DNS · Gates · Live Rooms · Telegram · Billing · Audit; rebuild gold/ink command hero (max 2 CTAs).  
**Deferred:** full deletion of duplicated panel implementations inside `App.tsx` (still the live entry).

### B. Anonymous visitor — Community Gate

```
community.myfenrir.com/g/:slug
  OR myfenrir.com/community|gate/:slug (fenrir-bridge CommunityNeonGateRoute)
→ preview / standards / SSO handoff → myfenrir.com/api/auth/community-sso
→ return to gate / Telegram destination
```

**Observed:** Public gate route and fenrir-bridge gate routes exist. SSO allowlist in fenrir-bridge is intentionally narrow (`/api/auth/community-sso`, `/api/telegram/link/start`).

**P0:** none confirmed without authenticated browser.  
**P1:** brand/theme parity between community-bridge gate and fenrir-bridge neon gate still dual-implemented.  
**P2:** demo route and onboarding motion are helpful but easy to confuse with production.

**Fixed:** community dashboard visual family shifted to Fenrir gold/ink (removed purple `#7c3aed` wash).  
**Deferred:** unifying gate runtime to a single package.

### C. New member join / gate

```
Public gate → human/auth → community-sso → activate (/activate Telegram link)
→ optional /standards → destination handoff (Telegram)
```

**Code evidence:** `activate.tsx` redirects unauthenticated users to `/login`; success path can send to `/gate?onboarding=1`. Gate creation uses quota (`FREE_GATE_LIMIT` / Pack). Verified Telegram destination is required before “community complete” on the community dashboard.

**P0:** none confirmed.  
**P1:** “complete” semantics correctly require verified destination — good — but failure modes for destination lookup currently collapse to empty list (safe, but silent).  
**P2:** copy still mentions Neon in several operator strings.

**Deferred:** destination-load error UX; Neon wording cleanup.

### D. Returning member

```
Login → session cookie → /dashboard (community) or /main (MyFenrir)
→ Gates list / Telegram identity / Pack upgrade
```

**Observed:** `/dashboard` and `/main` shells 200. Session APIs reject anonymous readiness.

**P1:** returning operators may still land on dense command page with many panels at once.  
**Fixed:** clearer nav + command hero CTAs toward Domains+DNS and Gates only.

### E. Community admin / staff

```
Staff session → /admin, /brands, /moderation, /access (owner)
→ courtesy / brand sync / pending moderation reviews
```

**Code evidence:** dashboard loads pending reviews only when `isStaff`; brands/admin nav gated.

**P1:** staff surfaces remain visually richer than MyFenrir ops — intentional, but family alignment was incomplete (purple accents).  
**Fixed:** gold/ink token + dashboard hero alignment.  
**Deferred:** shared design-token package across both apps.

### F. MyFenrir operator (domains / DNS / rooms / Telegram / billing)

```
/main → Domains + DNS Wizard
  → Prepare TXT+CNAME proof → Verify and connect → Pages attach → HTTPS
→ Live Rooms (/room/:slug)
→ Telegram identity link / re-add
→ Billing (Telegram Stars / The Pack) + Audit log
```

**Code evidence:** ownership proof flow from `codex/myfenrir-dns-release` ported: `shared/dns-lookup.ts`, `DnsLookupPanel`, `domain-lifecycle.ts`, `/api/domains/lookup|check|capabilities`. DnsWizard consolidated onto `dashboardPanels` (includes lookup). App + DashboardRoute both wire `connectDomain`.

**Release risks (documented, need Frisky OK):**

1. **Existing domain rows without proof fields** stop public resolution until Prepare + Verify again. Apex / proxied / flattened CNAME unsupported.  
2. **Recheck** temporarily moves routing toward pending/provisioning; provider/DNS failure can leave the host unavailable until a later successful retry.

**P0 (release risk, not silent bug):** shipping DNS proof without a migration/backfill plan for legacy verified rows.  
**P1:** App.tsx still hosts many duplicated panel helpers (import consolidation started for DnsWizard only).  
**Fixed:** DNS port + gold/ink wizard chrome + IA merge Domains+DNS; ES+EN (and FR/DE) i18n retained for dnsConnect/dnsLookup strings.  
**Deferred:** graceful recheck that keeps prior verified route until new proof succeeds; apex support.

---

## Priority rollup

| Priority | Count | Notes |
| --- | ---: | --- |
| **P0** | **1** | DNS legacy-domain public routing break on release without backfill/comms (**needs Frisky OK**) |
| **P1** | **5** | Dual dashboard surfaces; gate dual-implementation; silent destination lookup failure; dense command page (partially mitigated); DnsWizard import consolidation incomplete for other App.tsx panels |
| **P2** | **4** | Neon wording; demo vs prod confusion; shared token package; apex/proxied DNS unsupported (explicit) |

No conversion rates, latency SLOs, or traffic numbers are claimed — none were measured in this pass.

---

## Fixed vs deferred (this branch)

### Fixed
- Port DNS ownership-proof + lookup wizard from `codex/myfenrir-dns-release`.
- Consolidate `DnsWizard` onto `dashboardPanels` (includes `DnsLookupPanel`); App imports shared wizard; DashboardRoute gains connect + lookup parity.
- Operator IA: 7 items — Command, Domains + DNS, Gates, Live Rooms, Telegram, Billing, Audit.
- MyFenrir dashboard shell rebuild: dark full-bleed gold/ink, command hero with **2 CTAs**.
- Community dashboard / primary token aligned away from purple SaaS toward Fenrir gold/ink.
- Document DNS release risks in this audit + dns-wizard integration notes.

### Deferred (needs Frisky OK)
- Accept vs change recheck behavior that can drop public routing.
- Migration/backfill or forced re-verify campaign for domains lacking proof fields.
- Delete remaining duplicated panel implementations from `App.tsx` (or switch entry to `DashboardRoute` only).
- Single shared Community Gate package.
- Apex / proxied domain support (explicitly out of scope for current proof flow).

---

## What still needs Frisky OK

1. Ship DNS proof as-is knowing legacy domains go dark until re-verified, **or** require a backfill/soft-launch plan first.  
2. Accept temporary routing loss on recheck, **or** ask for keep-last-known-good routing.  
3. Whether `App.tsx` remains the long-term `/main` entry after IA rebuild (recommended short-term: yes; long-term: thin App → DashboardRoute).  
4. Whether community primary should stay gold globally (this PR shifts it) vs brand-themed red for non-Fenrir tenants.
