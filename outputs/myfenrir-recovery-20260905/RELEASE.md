# MyFenrir recovery release — September 5, 2026

Published to `https://myfenrir.com` and `https://www.myfenrir.com`.

- Pages deployment: `f8b485a1.fenrir-bridge.pages.dev`.
- Deployed GitHub source commit: `6635305b96f15369cf7f502f4dcfcae37a08f15e`.
- Deployed source tree: `2047b86783d10cf60619800a5b3bb64f4cc06dc4` (identical to local commit `2792d1e`).
- Browser entry: `index-B8dV-RnJ.js` on both public domains and the deployment URL.
- Source preserved in draft PR: https://github.com/FriskyDevelopments/fenrir-unified/pull/23 . The PR is not merged; its production lineage differs from main and needs integration review.

## Repairs

Session and workspace requests now expire with visible retry/sign-out controls. Logout clears the host-only cookie created by Supabase and the older parent-domain cookie, clears local credentials even when provider revocation fails, and aborts pending session exchanges. Callback errors and missing sessions clean consumed codes/tokens from the address while preserving safe destinations and the Community handoff.

Post-deployment checks exposed existing edge routing conflicts. `fenrir-auth-worker` claimed `/auth/*` and `/api/telegram/link*`, masking the SPA callback and canonical signed Telegram confirmation. Added six narrower routes without a Worker, listed in `callback-route-repair.json`, for the callback, compatibility callback, and confirmation paths on apex and www. The application now handles these routes. Confirmation still rejects unsigned requests with `401 invalid_signature`.

Cloudflare documents this supported exclusion behavior at https://developers.cloudflare.com/workers/configuration/routing/routes/#matching-behavior . These are routing changes, not DNS or credential changes.

## Verification

- Full suite: 184 tests passed before the final redirect guard addition. Final focused rerun: 29 API/callback tests passed, including the added test (185 distinct passing cases overall).
- TypeScript and final production build passed.
- Six production-build browser scenarios with synthetic fixtures passed: session failure/retry, timeout, workspace failure/retry, expiry, failed logout/retry, and authenticated navigation/reload/logout/return. A focused final rerun confirmed the stale recovery notice clears.
- Actual handler headers removed both cookies in an isolated browser.
- Live human verification reached Google sign-in on MyFenrir and Community Bridge; all three advertised provider authorization starts were enabled.
- After route repair, live callback cancellation on apex and www returned to recoverable sign-in with no JavaScript/resource errors.
- `scripts/verify-myfenrir.sh`: all 12 checks passed after route repair.
- `scripts/verify-auth-routing.mjs`: all 10 routing checks passed, including callback query strings and unsigned Telegram confirmation rejection.
- Production D1 responded to a schema-only read; no database rows were written during this check. The restrictive `SUPABASE_ADMIN_EMAILS` setting is absent from production.

No real account credentials were entered. Full production OAuth completion, authenticated account provisioning, real Telegram linking and payments remain unverified. Browser account flows used isolated synthetic fixtures. No user email, payment or identity record was created during validation.

## Recovery and source preservation

The prior production Pages deployment is `668370f4-dba6-4f67-a863-fda990234773`. The release was isolated from its recovered source under the `29e0` worktree; canonical uncommitted work was preserved.

If application rollback becomes necessary, use the prior Pages deployment separately from routing. To reverse only the route changes, delete only the six route IDs in `callback-route-repair.json`; restoring the broader Worker behavior will also restore the diagnosed 404s. A local full pre-change route snapshot is retained at `routes-before.json`; do not replace the entire zone route list.

Repeat public checks from `apps/fenrir-bridge` with:

```sh
bash scripts/verify-myfenrir.sh
bash scripts/run-with-node-lts.sh node scripts/verify-auth-routing.mjs
```
