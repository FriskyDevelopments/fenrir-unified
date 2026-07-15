# Cursor Handoff: Neon Nexus White-Label Rebuild

## Target

Repo:

```text
/Users/friskypup/Documents/Playground/frisky-spark-lab/apps/fenrir-bridge
```

Goal:

```text
Implement the Neon Nexus brand/admin wizard and production Neon-backed community auth flow inside the existing Fenrir dashboard shell.
```

Preserve the Emergent Neon Nexus UX/design as the baseline: public gate feel, card language, 6-step wizard rhythm, preview panel, CTA hierarchy, and dashboard-shell integration. Replace only infra/auth/API/persistence with Fenrir production plumbing.

## Critical Constraints

- Do not create `/community-admin`.
- Add the admin wizard inside the existing Fenrir dashboard shell.
- Public aliases must remain equivalent:
  - `/community/neon-nexus`
  - `/community/group/neon-nexus`
- Public brand API:
  - `GET /api/community-auth/brand/:slug`
- Admin brand API:
  - `GET /api/community-auth/admin/brands/:slug`
  - `PUT /api/community-auth/admin/brands/:slug`
- Persist directly to Neon table `fenrir_gate_communities`.
- Keep community auth isolated from legacy Supabase app auth:
  - community cookie: `fenrir_community_session`
  - legacy app cookie: `fenrir_session`
- Phase 0 default must be `FENRIR_BRAND_ADMIN_MODE=internal_only`.
- Frisky dev/admin override stays enabled in all phases.
- Use `apply_patch` for manual file edits. Do not edit files with shell heredocs or `cat > file`.

## Current State

Some implementation exists already in:

```text
functions/_lib/community-auth.ts
functions/api/community-auth/magic-link/request.ts
functions/api/community-auth/magic-link/consume.ts
functions/api/community-auth/me.ts
functions/api/community-auth/proposal.ts
src/services/communityAuth.ts
src/App.tsx
src/components/AuthSurface.tsx
src/styles/global.css
.env.example
```

The worktree is dirty from broader Fenrir work. Do not revert unrelated files.

## Implemented Or Partly Implemented

`functions/_lib/community-auth.ts` already contains useful shared helpers:

- `normalizeCommunitySlug`
- `normalizeCommunitySlugOrThrow`
- `defaultBrandForSlug`
- `ensureCommunityBrandPayload`
- `validateCommunityBrandUpdate`
- `assertBrandPayload`
- `upsertCommunityBrand`
- `ensureCommunityMembershipForEmail`
- `getCommunityMembershipForUser`
- `createCommunitySessionRecord`
- `verifyCommunityBrandWriteAuthorized`
- `resolveCommunityAuthError`
- phased admin mode parsing:
  - `internal_only`
  - `allowlisted_owners`
  - `owner_self_service`

`functions/api/community-auth/magic-link/request.ts` has already been adapted to:

- require configured community auth env
- validate slug
- call `ensureCommunityBrandPayload`
- call `ensureCommunityMembershipForEmail`
- create 15-minute magic-link token
- return `delivery: pending_provider`
- optionally return `devLink`
- include `brandConfigured`

`functions/api/community-auth/me.ts` has already been adapted to:

- guard config
- read only `fenrir_community_session`
- return `communityOrgId`
- include `membership: { role, state }` when available

`functions/api/community-auth/proposal.ts` includes `brandConfigured`.

## Remaining Backend Work

1. Finish `functions/api/community-auth/magic-link/consume.ts`.

Current file still has old direct org/user/member creation logic. Rework it to:

- use `communityAuthConfigured`/`communityAuthNotConfigured`
- validate token
- validate slug via `normalizeCommunitySlugOrThrow`
- call `ensureCommunityBrandPayload(context.env, slug)`
- require `brand.communityOrgId`
- call `ensureCommunityMembershipForEmail(sql, email, brand.communityOrgId)`
- mark magic link used
- build community session payload with `communitySlug` and `communityOrgId`
- sign session and set `fenrir_community_session`
- call `createCommunitySessionRecord`
- redirect GET consume to `/community/{slug}`
- return JSON for POST consume including `communityOrgId` and membership

Use request metadata helpers already exported:

```ts
requestClientIp(context.request);
requestUserAgent(context.request);
sha256Hex(session);
```

2. Add public brand endpoint.

Path:

```text
functions/api/community-auth/brand/[slug].ts
```

Behavior:

- only GET
- if env missing, return `community_auth_not_configured`
- call `ensureCommunityBrandPayload`
- invalid slug returns `invalid_community_slug`
- returns canonical `CommunityBrandPayload`

3. Add admin brand endpoint.

Path:

```text
functions/api/community-auth/admin/brands/[slug].ts
```

Behavior:

- GET:
  - require configured env
  - require Frisky app session using `readSession` from `functions/_lib/auth.ts`
  - call `verifyCommunityBrandWriteAuthorized(session, env, slug)`
  - return brand payload and authorization reason
- PUT:
  - same auth guard
  - parse body
  - `assertBrandPayload(body)`
  - `upsertCommunityBrand(env, slug, payload)`
  - return brand payload and authorization reason
- errors through `resolveCommunityAuthError`

Unknown admin routes should keep falling through to the existing `functions/api/[[path]].ts` JSON 404.

## Remaining Frontend Work

1. Extend `src/services/communityAuth.ts`.

Add exported types and helpers:

- `CommunityBrandPayload`
- `CommunityBrandUpdatePayload`
- `getCommunityBrand(slug)`
- `getCommunityAuthBrandForAdmin(slug)`
- `saveCommunityBrand(slug, payload)`

2. Update `src/components/AuthSurface.tsx`.

Support runtime brand imagery:

- optional `logoUrl`
- optional `backgroundUrl`
- add CSS vars:
  - `--theme-bg-image`
  - optionally logo override via rendered `src`
- add `data-has-background`

3. Update public gate in `src/App.tsx`.

`CommunityNeonGateRoute` should:

- fetch `getCommunityBrand(slug)`
- merge response over `brandThemes.neonNexus`
- apply:
  - `name`
  - `logo_url`
  - `background_url`
  - `primary_color`
  - `secondary_color`
  - `accent_color`
  - `headline`
  - `subheadline`
- keep fallback if fetch fails
- preserve the existing magic-link form behavior

4. Add dashboard wizard in `src/App.tsx`.

Add a new `PageKey` inside the existing dashboard shell, for example:

```ts
'brands';
```

Route aliases:

```text
/brands
/community-brands
/neon-nexus
```

Do not use `/community-admin`.

Wizard design:

- 6 steps:
  1. Slug
  2. Identity
  3. Visuals
  4. Colors
  5. Copy
  6. Access
- include live preview of the public gate
- save through admin API
- owner-first UX but Phase 0 locked by backend admin mode

5. Add CSS in `src/styles/global.css`.

Add:

- `.community-auth-surface` token bridge
- `[data-has-background="true"]`
- wizard shell styles
- stepper
- color swatches
- preview panel

Keep the existing Fenrir dashboard visual language. Avoid a marketing page.

6. Update nav copy.

`src/i18n.ts` has `nav` arrays for `en`, `es`, `fr`, `de`. Add a label matching the new `pageKeys` entry.

## Env Additions

Add/update `.env.example`:

```text
PUBLIC_SITE_URL=https://myfenrir.com
FENRIR_BRAND_ADMIN_MODE=internal_only
FENRIR_BRAND_ADMIN_ALLOWLIST=
```

`FENRIR_BRAND_ADMIN_ALLOWLIST` can support global comma-separated email entries or JSON slug maps, per `parseAdminAllowlist`.

## Validation

Run:

```bash
npm run typecheck
npm run build
```

Then smoke locally or against production:

```bash
curl -i https://myfenrir.com/api/community-auth/proposal
curl -i https://myfenrir.com/api/community-auth/brand/neon-nexus
curl -i -X POST https://myfenrir.com/api/community-auth/magic-link/request \
  -H 'content-type: application/json' \
  -d '{"email":"test@domain.com","slug":"neon-nexus"}'
```

Expected:

- proposal returns `configured: true` in production once env is set
- brand returns canonical payload
- invalid slugs return `400 invalid_community_slug`
- Phase 0 admin writes deny non-admin users
- admin override works through `SUPABASE_ADMIN_EMAILS`
- `/community/neon-nexus` and `/community/group/neon-nexus` share the same UX shell

## Watchouts

- Existing schema currently defines `fenrir_gate_communities.enabled_auth_providers text[]`, while newer spec says JSONB. Current helper writes `JSON.stringify(...)`; verify Neon schema/runtime compatibility before shipping. Either migrate column to JSONB or adjust helper writes/reads to text array.
- `default_access_state` currently maps UI values to legacy DB values:
  - `provisional` -> `pending`
  - `open` -> `active`
  - `disabled` -> `denied`
  - `invite_only` currently maps to `pending`
- There are duplicate lines in `src/App.tsx` from unrelated existing work, for example duplicate `const id = Date.now()` and duplicate `commerceService.click(...)`. Do not broaden scope unless typecheck forces it.
- The worktree includes many unrelated modified files. Touch only the files needed for this Neon Nexus task.
