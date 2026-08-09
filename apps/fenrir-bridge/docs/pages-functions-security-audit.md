# Pages Functions Security Audit Report

**Date**: 2026-08-09
**Scope**: All Cloudflare Pages Functions (`functions/api/**/*.ts`) in `apps/fenrir-bridge`
**Total files reviewed**: 37

---

## Executive Summary

All 37 Pages Functions files were reviewed for SQL injection, authentication/authorization gaps, input validation, secret exposure, and CORS consistency.

**Result**: No high-severity vulnerabilities found.
**Medium-severity findings**: 2 (fixed)
**Low-severity findings**: 2 (documented)

---

## Findings

### MEDIUM — Timing Attack on Webhook Secret Comparison

**Files affected**:
- `functions/api/telegram/webhook.ts` (line 50)
- `functions/api/lock-bot/webhook.ts` (line 38)

**Issue**: Both webhook endpoints compare the `x-telegram-bot-api-secret-token` header against the configured secret using JavaScript's `!==` operator. This is a timing side-channel vulnerability — an attacker can iteratively guess the secret by measuring response time differences.

**Fix applied**: Replaced `!==` with `timingSafeEqual()` in both files:
- `telegram/webhook.ts` now imports `timingSafeEqual` from `../../_lib/auth`
- `lock-bot/webhook.ts` now uses a local `timingSafeEqual` implementation (matching the pattern from `_lib/auth.ts`)

**Before**:
```ts
if (received !== configuredSecret) { ... }
```

**After**:
```ts
if (!timingSafeEqual(received, configuredSecret)) { ... }
```

---

### MEDIUM — Missing Authorization Check on Security Report Endpoint

**File affected**: `functions/api/community-gate/admin/security-report.ts`

**Issue**: The endpoint at `/api/community-gate/admin/security-report` required authentication (`readSession`) but did not verify that the authenticated user had staff or admin privileges for the requested community. Any authenticated user could query security statistics for any community.

**Fix applied**: Added `assertCommunityStaff(context.env, user, communitySlug)` authorization check after session validation, consistent with other admin endpoints like `review.ts` and `audit/list.ts`. The endpoint now returns `403 forbidden` for non-staff users and `401` for unauthenticated requests.

**Additional fix**: Removed the mock-data fallback on DB errors that returned `ok: true` with fabricated statistics. This could leak the existence of communities and mislead the frontend. Errors are now properly propagated through `authErrorResponse`.

---

### LOW — Client Error Stack Traces Not Scrubbed

**File affected**: `functions/api/observability/client-error.ts`

**Issue**: Client-side error reports include `stack` traces that could contain sensitive information (internal URLs, tokens, user data). The stack is truncated to 12,000 characters but not scrubbed for secrets.

**Recommendation**: Consider adding a stack-trace scrubbing function that redacts common secret patterns (API keys, tokens, internal hostnames) before forwarding to Honeybadger.

---

### LOW — Mock Data Fallback in Security Report

**File affected**: `functions/api/community-gate/admin/security-report.ts` (pre-fix)

**Issue**: When the Neon database was unavailable, the endpoint returned fabricated mock data with `ok: true`, making it indistinguishable from real data. This could allow an attacker to enumerate valid community slugs by observing whether real or mock data was returned.

**Fix applied**: Removed the mock-data fallback. DB errors now return proper error responses via `authErrorResponse`.

---

## Security Postures by Category

### 1. SQL Injection
**Status: PASS**

All D1 queries across all 37 files use parameterized queries:
- D1 `.prepare(...).bind(...)` pattern in `telegram/`, `rooms/`, `bridges/`, `domains/`, `waitlist.ts`
- Neon tagged template literals (`sql`...`WHERE id = ${value}``) in `community-gate/`, `community-auth/`
- No string concatenation or template literal injection found in any query.

### 2. Authentication / Authorization
**Status: PASS (with 1 fix applied)**

- All protected routes use `readSession`, `readCommunitySession`, or OAuth flow validation
- Admin endpoints (`community-gate/admin/review.ts`, `audit/list.ts`, `brands/[slug].ts`) use `assertCommunityStaff` for proper authorization
- Webhook endpoints validate secrets via headers
- Public endpoints (`public/room/[slug].ts`, `public/bridge/[slug].ts`, `waitlist.ts`, `health.ts`) are intentionally unauthenticated
- **Fixed**: `security-report.ts` now properly authorizes staff-only access

### 3. Input Validation
**Status: PASS**

All endpoints validate and sanitize inputs:
- Body fields are type-checked (`typeof body?.field === "string"`)
- Strings are trimmed and length-limited
- Format validation with regex where appropriate (email, chat IDs, UUIDs, slugs)
- Enum validation for status values and providers
- `communitySlug` is normalized via `parseSlug()` / `normalizeCommunitySlug()`

### 4. Secrets / Sensitive Data Exposure
**Status: PASS**

- No secrets are returned in API responses
- Error messages do not leak secret values
- Bot tokens are used server-side only (not returned to clients)
- Stack traces in error reporting are truncated (though not scrubbed — see LOW finding)
- Session cookies use `HttpOnly; Secure; SameSite=Lax`

### 5. CORS Configuration
**Status: N/A (consistent)**

Pages Functions on Cloudflare Pages do not set explicit CORS headers. CORS is handled at the Cloudflare Pages level or via the reverse proxy. All endpoints return JSON with `Cache-Control: no-store` via the `noStoreJson()` helper. No CORS misconfigurations were found.

---

## Files Reviewed (37 total)

| File | Auth | SQL Injection | Input Validation | Secrets | Status |
|------|------|---------------|------------------|---------|--------|
| `telegram/readd.ts` | session | parameterized | good | clean | PASS |
| `telegram/webhook.ts` | webhook secret | parameterized | good | clean | FIXED |
| `telegram/stars.ts` | session | none | good | clean | PASS |
| `telegram/check.ts` | session | parameterized | good | clean | PASS |
| `telegram/link.ts` | session | helper | good | clean | PASS |
| `telegram/chat-photo.ts` | session | none | good | clean | PASS |
| `readiness.ts` | session | none | N/A | clean | PASS |
| `public/room/[slug].ts` | public | parameterized | good | clean | PASS |
| `public/bridge/[slug].ts` | optional | parameterized | good | clean | PASS |
| `public/waitlist.ts` | public | parameterized | good | clean | PASS |
| `internal/community/allowlist-check.ts` | internal secret | parameterized | good | clean | PASS |
| `media/proxy.ts` | signed URL | none | good | clean | PASS |
| `observability/client-error.ts` | none | none | minimal | clean | LOW |
| `stripe/webhook.ts` | stripe sig | parameterized | good | clean | PASS |
| `rooms.ts` | session | parameterized | good | clean | PASS |
| `rooms/pause.ts` | session | parameterized | good | clean | PASS |
| `lock-bot/webhook.ts` | webhook secret | helper | basic | clean | FIXED |
| `health.ts` | none | none | N/A | clean | PASS |
| `community-gate/invite/verify.ts` | gate user | parameterized | good | clean | PASS |
| `community-gate/auth/me.ts` | gate user | helper | N/A | clean | PASS |
| `community-gate/admin/security-report.ts` | session+staff | parameterized | good | clean | FIXED |
| `community-gate/admin/review.ts` | session+staff | parameterized | good | clean | PASS |
| `community-gate/audit/list.ts` | session+staff | parameterized | good | clean | PASS |
| `domains/check.ts` | session | parameterized | good | clean | PASS |
| `domains/search.ts` | session | none | good | clean | PASS |
| `frisky-auth/[[path]].ts` | disabled | parameterized | N/A | clean | PASS |
| `domains.ts` | session | parameterized | good | clean | PASS |
| `community-auth/me.ts` | community session | parameterized | N/A | clean | PASS |
| `community-auth/magic-link/request.ts` | none | parameterized | good | clean | PASS |
| `community-auth/magic-link/consume.ts` | none | parameterized | good | clean | PASS |
| `community-auth/proposal.ts` | none | none | N/A | clean | PASS |
| `community-auth/oauth/callback/[provider].ts` | OAuth | none | good | clean | PASS |
| `community-auth/oauth/[provider].ts` | OAuth | none | good | clean | PASS |
| `community-auth/admin/brands/[slug].ts` | session+authz | parameterized | good | clean | PASS |
| `community-auth/logout.ts` | none | none | N/A | clean | PASS |
| `community-auth/brand/[slug].ts` | none | parameterized | good | clean | PASS |
| `bridges/rotate.ts` | session | parameterized | good | clean | PASS |
| `billing/portal.ts` | session | none | N/A | clean | PASS |
| `billing/status.ts` | session | none | N/A | clean | PASS |
| `billing/checkout.ts` | session | parameterized | good | clean | PASS |
| `bridges.ts` | session | parameterized | good | clean | PASS |
| `auth/me.ts` | session | none | N/A | clean | PASS |
| `auth/callback/[provider].ts` | OAuth | none | good | clean | PASS |
| `auth/supabase-session.ts` | none | none | good | clean | PASS |
| `auth/complete.ts` | transfer token | none | good | clean | PASS |
| `auth/logout.ts` | none | none | N/A | clean | PASS |
| `auth/login/[provider].ts` | OAuth | none | good | clean | PASS |
| `auth/telegram-session.ts` | none | helper | good | clean | PASS |
| `bridges/revoke.ts` | session | parameterized | good | clean | PASS |
| `app-state.ts` | session | none | N/A | clean | PASS |
| `[[path]].ts` | disabled | parameterized | N/A | clean | PASS |

---

## Recommendations

1. **Stack trace scrubbing**: Add a utility function to `_lib/` that redacts common secret patterns from error reports before forwarding to Honeybadger.
2. **Rate limiting**: Consider adding rate limiting headers or Cloudflare Rate Limit rules on public endpoints (`waitlist.ts`, `client-error.ts`) to prevent abuse.
3. **CORS headers**: If the API is consumed by browsers on different origins, explicitly set CORS headers rather than relying on platform defaults.
4. **Content Security Policy**: Consider adding CSP headers to responses that serve HTML content (error pages, redirects).
