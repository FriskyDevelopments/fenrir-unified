# DNS Wizard — Cloudflare switch + fuzzy live search

The DNS Wizard lives in the **fenrir-bridge** app (MyFenrir / Fenrir Telegram
Lock): `src/App.tsx` → the **Cloudflare DNS Wizard** panel (nav keys
`command` / `domains` / `dns`). It is a Vite React SPA with Cloudflare Pages
Functions under `functions/api/domains/*`, deployed to `fenrir-bridge.pages.dev`
/ `myfenrir.com`.

Two features shipped on branch `feat/dns-wizard-cloudflare-switch` (additive; no
prod cutover). Both fail safe: if a credential is missing they self-report and the
wizard stays in manual mode.

---

## Feature A — Switch DNS to Cloudflare (automatic Universal SSL)

Goal: move a customer domain's DNS to Cloudflare so the Telegram Lock URLs
(`join.customer-domain.com`) get an automatic TLS certificate.

**Backend**
- `functions/_lib/cloudflare-dns.ts` — Cloudflare API client + `registrableApex()`
  (subdomain → zone apex, incl. a small two-level-suffix set like `co.uk`) +
  `cloudflareConfigured()` gate. Token/account id read **only** from
  `context.env` — never hardcoded, never sent to the browser.
- `POST /api/domains/cloudflare-zone` `{ domainId }` — create **or** identify the
  zone (idempotent), persist `cloudflare_hostname_id` (zone id) +
  `cloudflare_nameservers` to `frisky_domains`, return the real nameservers.
- `POST /api/domains/cloudflare-status` `{ domainId }` — poll: zone `active`
  (nameservers propagated) + Universal SSL. When active, marks the domain
  `verified` and, once the cert issues, `certificate_status = active`.

**Frontend** — in `DnsWizard`: **Switch DNS to Cloudflare** → shows the two NS
records to paste at the registrar; **Check propagation & SSL** → polls until the
cert is live (celebration on active).

**Flow:** add domain → Switch DNS to Cloudflare → paste NS at registrar → Check
propagation & SSL → verified + certificate active.

No DB migration: `frisky_domains` already has `cloudflare_hostname_id` and
`cloudflare_nameservers` columns (`docs/product-d1-schema.sql`).

**When not configured:** the endpoints return `cloudflare_not_configured` (503)
and the UI keeps showing the manual NS/TXT/CNAME records — nothing breaks.

---

## Feature B — Live domain search (fuzzy)

Registrar-style fuzzy suggestions instead of exact `base.<tld>` only.

- `domainSearchCandidates()` (in `App.tsx`) fans a brand/handle into ranked,
  deduped variants: exact base across premium TLDs, brandable **suffixes**
  (`friskyapp.com`, `friskyhq.com`, `friskyapp.io`, `friskyhq.co`), and
  **prefixes** (`getfrisky.com`, `tryfrisky.com`, `myfrisky.com`). So `frisky`
  surfaces `frisky.dev`, `getfrisky.com`, `friskyapp.io`, `friskyhq.co`, …
- Availability is checked **live** on the edge via the existing
  `GET /api/domains/availability` (RDAP authoritative + DoH fallback), now called
  **batched** (`?domains=a,b,c`, up to 16) in one request.
- `rankDomainResults()` sorts available → cheaper tier → shorter first; taken /
  invalid sink.
- **Register** opens the registrar checkout (Dynadot affiliate link) with the
  domain prefilled. **No autonomous purchase** — the human confirms and pays
  (finance rule). True in-app registration is left dormant behind
  `DYNADOT_API_KEY` (see below).

---

## Secret Center — what's missing

Registered in `~/frisky-secret-center/registry/fenrir.json`:

| Key | Status | Needed for | Source |
| --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | **missing** | Feature A zone create + NS/SSL read | `op://FriskyDev-Infra/Cloudflare/ACCOUNT_TOKEN` (Zone:Read + Zone:Edit + DNS:Edit) → **fenrir-bridge Pages** env |
| `CLOUDFLARE_ACCOUNT_ID` | **missing** | Feature A zone target account | Cloudflare dashboard / `wrangler whoami` → fenrir-bridge Pages env |
| `DYNADOT_API_KEY` | **dormant** | Optional true 1-click in-app registration | Dynadot → Tools → API (only if wanted; register-via-checkout works without it) |

> The scoped **CI** Pages-deploy token lacks `Zone·DNS:Edit`. Use the master
> account token (or a purpose-scoped one) for the **runtime** Pages secret — this
> is a different binding from the CI token.

Owner steps to enable Feature A:
1. Set `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` on the **fenrir-bridge**
   Pages project (Production env).
2. Redeploy (or the vars apply on next deploy).
3. In the wizard: add a domain → **Switch DNS to Cloudflare**.
