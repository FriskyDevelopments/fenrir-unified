# DNS-WIZARD in MyFenrir

Implemented on `codex/myfenrir-dns-release`, based on current MyFenrir main
`5f316c71a5788483256fa4d2402ca11e9bc58aa4`. The earlier diagnostic worktree at
`93960f4` was retained as a backup; its older auth implementation was not carried
forward. This document records local implementation and validation. Deployment,
production configuration, and authenticated browser evidence are tracked by the
release coordinator separately. No database migration is required.

## Provenance and scope

Source reviewed: [FriskyDevelopments/DNS-WIZARD](https://github.com/FriskyDevelopments/DNS-WIZARD),
commit `a4c76c46904029476a2dd35c1a82fa2085d9f496`.

The source's record/evidence wizard and real Cloudflare/Google probes in
`src/utils/dnsUtils.ts` informed the native adaptation. It does not import the
source's simulated Quad9/edge success, generated certificate success, client
verification tokens, fabricated evidence hashes, client credential vault, or AI
placeholders. The existing MyFenrir DNS+RDAP availability search already covers
name discovery and was left unchanged.

The shipped entry remains `src/main.tsx` → `src/App.tsx`. As of
`feat/myfenrir-dashboard-dns-rebuild` (2026-09-11), `DnsWizard` lives in
`src/routes/dashboardPanels.tsx` and embeds `DnsLookupPanel`. App imports that
shared wizard; `DashboardRoute` mounts the same component with ownership-proof
`connectDomain` wiring. Operator IA merges Domains + DNS Wizard into one nav item.
UI chrome uses Fenrir gold/ink (not neon-lime).

The panel uses existing design tokens and English/Spanish/French/German `Copy`
translations. Users can query a complete domain or owner such as
`_dmarc.example.com`, choose one of seven record types or all, and inspect each
resolver's answer, queried type, RCODE, TTL, raw record data, alias evidence,
and observation timestamp. Disagreement and partial failures remain visible.

The selected domain has a shortcut. Exact TXT/CNAME comparisons are offered for
stored fully qualified record names with configured values. Legacy relative names
such as `_fenrir` or `main` are not expanded using an assumed DNS zone. Comparisons
require exact owner and record type; TXT strings are case-sensitive and only
segments within the same resource record are concatenated. CNAME name comparison
ignores case and a trailing dot. A match never changes ownership, certificate, or
activation state.

## Read-only API contract

`GET /api/domains/lookup?domain=example.com&type=ALL`

- Uses existing `readSession` authentication before DNS requests, including the
  current canonical auth Worker and legacy signed-session fallback.
  Missing, malformed, and expired sessions return `401` without resolver access.
- Invalid names/types return `400`; URLs, IPs, ports, credentials, spaces,
  wildcard names, and unsupported types are rejected. DNS service labels and IDN
  names are supported.
- Success returns `{ ok: true, domain, checkedAt, resolvers }`. Each of the two
  resolvers has `{ id, name, queries }`. Each query contains `type`, `status`,
  `rcode`, `records`, `aliases`, and an optional bounded error code.
- Supported types: A, AAAA, CNAME, MX, TXT, NS, SOA. Query status is `records`,
  `no_records`, `nxdomain`, or `resolver_error`. DNS errors remain errors even
  when the transport status is HTTP 200. NXDOMAIN can refer to an alias target;
  reachable alias evidence is preserved.
- Calls only fixed Cloudflare/Google public DNS JSON endpoints. Up to 14 GETs per
  all-type lookup, no more than four in flight. Four-second timeouts remain active
  through response-body reads; request cancellation prevents subsequent batches.
- Missing/invalid DNS status, malformed payload, mismatched question, truncated
  response, invalid records, HTTP errors, and resolver failures never become
  successful empty answers. Requested records must belong to the queried owner or
  a reachable, cycle-checked CNAME chain bounded to 16 hops.
- Responses use `Cache-Control: no-store`. No database writes or domain-state
  updates occur. `src/services/dnsLookup.ts` uses only the authenticated same-origin
  route and validates the nested response before rendering. It has no mock or
  direct browser DNS fallback, including on `401`/`403`.
- Editing the name/type, starting a new lookup, or unmounting the panel cancels
  the previous browser request and discards late responses.

Diagnostics alone never activate ownership or HTTPS. Public observations do not
establish domain availability or worldwide propagation.

## Ownership and Pages connection

Current main already contains a Cloudflare Pages attachment flow. This release
hardens that flow rather than introducing a separate custom-hostname provider.

1. Authenticated, same-origin `POST /api/domains` prepares a random server-generated
   64-character challenge for `_fenrir.<exact-host>` and the configured Pages CNAME
   target. It makes no provider or DNS calls. Pending challenges are tenant-specific:
   another tenant's unproven challenge cannot permanently reserve a hostname.
2. `POST /api/domains/check` loads only the session organization's domain ID.
   Both Cloudflare and Google must independently return the exact TXT token and
   exact public CNAME at that hostname. Existing Pages attachment is never ownership
   proof. A legacy row without a valid challenge must prepare records again.
3. The zone must belong to the server-configured Cloudflare account. A single SQLite
   conditional update reserves the proven hostname before any Pages attachment.
   Other verified owners or active two-minute provisioning leases block the claim.
   Expired leases do not block a proven claimant or its public routes.
4. Pages requests use the fixed Cloudflare API, bounded timeouts, and sanitized
   failures. A confirmed missing hostname permits creation; provider read failures
   never trigger speculative creation. Only the Pages domain's top-level `active`
   status produces `verified` / `active`. Nested validation status is insufficient.
5. Finalization compares the stored token, target, status, and lease timestamp.
   Late results cannot activate a changed challenge or supersede another owner.
   DNS/provider failures remain pending or failed. Audit records omit tokens.

Public room and bridge resolution requires the exact hostname, matching resource
and domain organization, a valid stored ownership challenge, verified status,
active HTTPS, and no competing proven or active leased claim. There is no automatic
apex/`www` alias. New rooms use `/room/:slug`; old stored room links are normalized
to that mounted route at read time without a data migration.

`GET /api/domains/capabilities` exposes configuration presence and supported mode
without credentials. The UI disables setup if the database or provider token is
missing and catches preparation/check errors without a mock fallback.

Runtime configuration is `DB`, `CLOUDFLARE_API_TOKEN`, and optional
`CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_PAGES_PROJECT` (existing defaults retained).
The provider credential needs account Pages read/edit and zone read for the
configured account. This flow does not connect arbitrary customer accounts and
does not write DNS records. It supports dedicated subdomains with an unflattened,
DNS-only public CNAME. Apex, proxied, or flattened CNAME routing is explicitly
unsupported; no DNS-record permission or token is added by this code.

Cloudflare's [Pages domains API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/domains/)
defines the provider domain status used here. Existing auth, billing, entitlements,
and payment configuration remain unchanged.

## Local validation on 2026-09-09

The isolated checkout reused the current-main dependency installation from the
September 8 quality-release checkout through a temporary symlink. Package
lifecycle hooks were not invoked: `postinstall` and
`pretypecheck` contain unrelated cleanup scripts. Actual commands:

```sh
bash scripts/run-with-node-lts.sh node node_modules/typescript/bin/tsc --noEmit
bash scripts/run-with-node-lts.sh node node_modules/vite/bin/vite.js build
bash scripts/run-with-node-lts.sh node node_modules/vitest/vitest.mjs run functions/__tests__/dns-lookup.test.ts
bash scripts/run-with-node-lts.sh node node_modules/vitest/vitest.mjs run
bash scripts/run-with-node-lts.sh node --test workers/fenrir-auth/test/*.test.mjs workers/fenrir-redirects/worker.test.mjs
bash scripts/run-with-node-lts.sh node scripts/test-auth-redirect.mjs
WRANGLER_SEND_METRICS=false bash scripts/run-with-node-lts.sh node_modules/.bin/wrangler pages functions build functions --outdir /private/tmp/myfenrir-dns-release-functions
```

- TypeScript passed. Vite production build passed (539 modules).
- New focused suite passed **30/30**, covering input validation, resolver evidence,
  NXDOMAIN/error distinctions, malformed/truncated responses, CNAME ownership and
  cycles, body timeout/cancellation, exact TXT/CNAME matching, signed-session
  authorization, invalid queries, no provider writes, no auth-bypassing browser
  fallback, and malformed nested HTTP 200 responses.
- **13/13** SQLite-backed lifecycle tests execute actual schema and queries using Node 22
  `node:sqlite`, covering pending duplicates, simultaneous reservations, expired
  lease takeover, stale token/lease completion, provider failure, ownership before
  attachment, exact public host/tenant isolation, and old/new room URLs.
- The current-main full Vitest suite passed **255/255** across 35 files. Separate
  auth Worker/redirect tests passed **74/74**, and the auth redirect script passed
  **9 checks**.
  The old-base Apple fixture failure does not occur on current main; no old auth
  code or fixture change was copied into this release.
- Pages Functions compiled successfully with installed Wrangler 4.127.1. Its
  standalone build warned that Better Auth's Node imports require `nodejs_compat`;
  the existing `wrangler.jsonc` already enables that flag and deployment must
  preserve it. This was a local Worker bundle check, not deployment.
- Root independently ran the new core against real Cloudflare and Google on
  `example.com` for all seven types. Both returned records for A, AAAA, MX, TXT,
  NS, SOA and a successful `no_records` CNAME result. This verifies public-provider
  connectivity through the local module; it is not an authenticated deployed E2E.
- An independent reviewer compiled all lifecycle SQL against the real schema and
  reproduced reservation, takeover, stale completion, and exact-host scenarios.
- `git diff --check` passed. Local tests used only in-memory data and fabricated
  unit-test provider responses; no production DNS or database data was changed.

Local unit tests do not claim a credentialed production journey or a successful
customer hostname attachment. The release coordinator owns that evidence.


## Cloudflare runtime correction

The installed workerd runtime rejects fetch `redirect: "error"` although Node
accepts it. Public DNS and Cloudflare provider requests now use `manual` and reject
non-2xx responses. A DNS redirect test and five provider redirect tests ensure that
301/302/303/307/308 cannot forward credentials, manufacture verified evidence, or
trigger a speculative hostname create after a redirected read.

The final 255-test Vitest suite and TypeScript passed. A real Miniflare/workerd
invocation ran this exact DNS engine against Cloudflare and Google for all seven
record types on `example.com` with no resolver errors. The same runtime rejected
a synthetic provider redirect without creation or a redirect-target request.
An independent review exercised 50 redirect scenarios across both applications.
These checks do not claim a customer hostname attachment or production user login.

## Release risks (Frisky OK required)

These risks were identified on draft PR #29 and remain **accepted-or-fix before
production** — this branch documents them; it does not silently change lifecycle
semantics.

1. **Existing domain rows without proof fields**  
   Public room/bridge resolution now requires a valid stored ownership challenge
   (`_fenrir.<host>` TXT + exact CNAME) plus verified status and active HTTPS.
   Legacy rows that only have Pages attachment state will **stop resolving
   publicly** until the operator runs Prepare DNS records → Verify and connect
   again. Apex hosts and proxied/flattened CNAMEs are unsupported by this flow.

2. **Recheck temporarily removes public routing**  
   Verify/recheck moves the row through pending/provisioning while DNS and Pages
   are re-checked. A DNS or provider failure can leave the hostname unavailable
   until a later successful retry. Alternatives (keep-last-known-good until the
   new proof succeeds) need an explicit product decision before release.

No automatic backfill migration ships with this code. Coordinate customer
comms or a soft-launch allowlist before flipping production.
