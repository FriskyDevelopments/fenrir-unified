# Adapt ClipsFlow to Your Cloudflare Infra

## Target architecture

```
your-domain.com
 ├─ Cloudflare Pages (static SPA build → dist/)
 │   └─ React app, client-side routed, talks to:
 ├─ /functions/api/*  (Pages Functions, edge runtime)
 │   ├─ admin/promote.ts    ← was src/lib/admin.functions.ts
 │   └─ (future server endpoints)
 └─ Your Supabase project (auth + DB + RLS)
```

Pages serves the static SPA. Anything that previously ran inside a TanStack `createServerFn` (today: the admin promote/list calls) becomes a Pages Function under `functions/api/*` and is called from the client with `fetch`.

## What changes

### 1. Build target

- Remove TanStack Start SSR; keep TanStack Router in **SPA / client-only** mode.
- New `vite.config.ts` outputs a plain static `dist/` (no `.output/server`).
- `index.html` becomes the SPA shell; root `__root.tsx` keeps only client providers (no `<html>`/`<head>` shell from Start).
- Drop `src/start.ts`, `src/server.ts`, `attachSupabaseAuth` global middleware — not needed in SPA.

### 2. Server functions → Pages Functions

- `src/lib/admin.functions.ts` is rewritten as:
  - `functions/api/admin/list-users.ts`
  - `functions/api/admin/promote.ts`
  - `functions/api/admin/demote.ts`
- Each verifies the caller's Supabase JWT (passed as `Authorization: Bearer …` from the client), checks the `admin` role via `has_role()`, then uses the **service role key** (bound as a Pages secret) for the Auth Admin work.
- Client calls switch from `useServerFn(...)` to `fetch('/api/admin/...', { headers: { Authorization: \`Bearer ${session.access_token}\` } })`.

### 3. Auth gating

- `_authenticated/route.tsx` already uses `ssr: false` + `supabase.auth.getUser()` — works as-is in SPA mode.
- Login flow (`/login`, `/activate`) unchanged; it's all client-side Supabase.

### 4. Pointing at YOUR Supabase

- `.env` becomes:
  - `VITE_SUPABASE_URL=https://<your-ref>.supabase.co`
  - `VITE_SUPABASE_PUBLISHABLE_KEY=<your anon/publishable key>`
  - `VITE_SUPABASE_PROJECT_ID=<your-ref>`
- Pages Functions secrets (set via `wrangler pages secret put …` or dashboard):
  - `SUPABASE_URL`
  - `SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- You run the two existing migrations in `supabase/migrations/` against your project (Supabase CLI: `supabase db push`). Includes the `app_role` enum, `user_roles` table + RLS, and the `has_role()` security-definer function.
- I'll add a short `MIGRATING.md` with the exact CLI steps.

### 5. Deployment

- Add `wrangler.toml` for Pages:
  ```toml
  name = "clipsflow"
  compatibility_date = "2026-01-01"
  pages_build_output_dir = "dist"
  ```
- Add `.github/workflows/deploy.yml`:
  - Trigger: push to `main`
  - Steps: checkout → setup bun → `bun install` → `bun run build` → `cloudflare/wrangler-action@v3` with `command: pages deploy dist --project-name=clipsflow`
  - Required GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, plus the three `VITE_SUPABASE_*` build-time vars.
- Pages Function secrets are set once via `wrangler pages secret put` — not in the workflow.

## Files I'll change / add

**Replace**

- `vite.config.ts` — drop Start plugin, switch to vanilla Vite + `@tanstack/router-plugin/vite` (SPA codegen)
- `package.json` — remove `@tanstack/react-start`, `@tanstack/start-plugin-core`, server runtime deps; keep router, query, supabase-js
- `src/router.tsx` — plain `createRouter`, no SSR hydration helpers
- `src/routes/__root.tsx` — strip `shellComponent`/`<html>`, keep providers + `<Outlet />`
- `index.html` — new SPA entry mounting `src/main.tsx`
- `src/routes/admin.tsx`, `src/routes/activate.tsx` — replace `useServerFn` calls with `fetch('/api/admin/…')`

**Add**

- `src/main.tsx` — SPA entry
- `functions/api/admin/list-users.ts`
- `functions/api/admin/promote.ts`
- `functions/api/admin/demote.ts`
- `functions/_middleware.ts` — shared JWT verify + admin check helper
- `wrangler.toml`
- `.github/workflows/deploy.yml`
- `public/_redirects` → `/*  /index.html  200` (SPA fallback for client routing)
- `MIGRATING.md` — Supabase migration + Cloudflare setup steps

**Delete**

- `src/lib/admin.functions.ts`
- `src/start.ts`, `src/server.ts`
- `src/integrations/supabase/auth-attacher.ts`, `auth-middleware.ts` (no longer used)
- `src/routes/api/` (if any)

## What stays the same

- All UI / styling / branding (ClipsFlow logo, FriskyDev mark, login design)
- Router structure and routes
- `has_role()` + `user_roles` security model from earlier migrations
- shadcn/ui components, Tailwind v4 config

## One-time setup you'll do after I'm done

1. `bun install && bun run build` locally to confirm it builds.
2. Create the Pages project: `wrangler pages project create clipsflow`.
3. Push Supabase schema: `supabase link --project-ref <ref> && supabase db push`.
4. Set Pages secrets: `wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name=clipsflow` (×3).
5. Add the four GitHub Action secrets, push to `main`, done.

## Open question

This is a significant refactor — removes SSR, removes server-rendered `<head>` SEO, and the app becomes a client-only SPA (fine for an internal/admin tool, less ideal for marketing pages).

Want me to proceed exactly as above, or would you rather keep SSR and target **Cloudflare Workers** instead of Pages? Workers is the natural home for TanStack Start and avoids ~80% of this refactor — only `wrangler.toml` + a GitHub Action are needed.
