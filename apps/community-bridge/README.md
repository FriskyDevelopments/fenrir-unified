# Community Bridge

Canonical standalone Community Bridge application for Fenrir. This directory is
the product surface extracted from the Lovable FENRIR Access Control remix.

## Product boundary

- `myfenrir.com` remains the main Fenrir dashboard for account, billing, Stars,
  Telegram locks, domains, and workspaces.
- Community Bridge owns community brands, public gates, gate previews, gate
  analytics, and community administration.
- The main dashboard launches this app at `https://gate.myfenrir.com/dashboard`.
- Supabase remains the central identity layer. D1 remains Fenrir paid-tier and
  entitlement truth. Neon remains community membership, invite, review, and
  audit truth.

## Source of truth

The UI and route structure in this app are canonical for Community Bridge. The
Lovable/Supabase implementation is only the presentation/reference starting
point; production data access must be adapted to Fenrir's existing APIs and
Neon/D1 contracts before deployment.

## Local development

```bash
npm install
npm run dev
```

Do not commit `.env`, secrets, `node_modules`, build output, or local Astro/Vite
generated state.
