# Fenrir Community Gate Neon Auth

Fenrir Community Gate is separate from the Frisky client portal.

The client portal can continue using its existing Frisky/Supabase session.
The Community Gate uses:

- Google, Apple, or Microsoft as the explicit member identity providers
- Supabase Auth only as the provider broker/session verifier if that is the chosen implementation path
- Neon Postgres as the Community Gate data plane
- `auth_subject` as the Supabase JWT `sub`
- no cross-database foreign key to `auth.users`

Magic link is acceptable as an optional fallback or recovery mode, but the primary Neon community login UX must be provider-specific:

```text
Continue with Google
Continue with Apple
Continue with Microsoft
```

This provider-specific Neon auth service is not the default low-tier gate. It is reserved for Fenrir's biggest subscription tiers and is also included for `HF4E`.

## Migration

Apply:

```text
docs/neon-community-gate-schema.sql
```

Do not use `profiles.id references auth.users(id)` in Neon. Neon cannot enforce a foreign key into Supabase Auth.

## Environment

Cloudflare Pages / Worker env needs:

```text
SUPABASE_URL=
SUPABASE_ANON_KEY=
NEON_DATABASE_URL=
```

`/api/readiness` reports Neon availability as `billing.neonConfigured` when
`NEON_DATABASE_URL` is present. This is intentionally separate from the
Telegram Stars + D1 paid-user launch gate.

The Vite client can also use:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## API

All MVP Community Gate endpoints are namespaced to avoid colliding with the Frisky client portal:

```text
GET  /api/community-gate/auth/me
POST /api/community-gate/invite/verify
POST /api/community-gate/admin/review
GET  /api/community-gate/audit/list
```

Send the Supabase access token as:

```text
Authorization: Bearer <supabase_access_token>
```

That token should come from a Google, Apple, or Microsoft provider session for normal member entry. Do not present a generic email-only Neon auth flow as the primary community gate.

Before enabling this flow for a community, verify that the owner is on an eligible high-tier subscription or `HF4E`.

## Invite Consumption

`POST /api/community-gate/invite/verify` calls:

```sql
consume_invite_code(code, community_slug, auth_subject, email, ip_address, user_agent)
```

The function atomically consumes an invite with `UPDATE ... RETURNING`, so raid traffic cannot double-spend the same invite usage slot.

## Review Flow

`POST /api/community-gate/admin/review` allows `platform_admin`, `community_owner`, and `community_staff` to set verification sessions to:

```text
granted
denied
flagged
```

Every review writes `SESSION_REVIEWED` to `audit_logs`.
