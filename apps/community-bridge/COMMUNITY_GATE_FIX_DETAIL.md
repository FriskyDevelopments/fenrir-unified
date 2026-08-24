# MyFenrir Community Gate Fix — Detailed Handoff

**Status:** Implemented in the current working tree; **not committed or deployed** as of 2026-08-19.

## What this fixes

The previous Gate flow allowed the browser to supply a `community_id` while a Gate was created or edited. That made a typed group label or a modified browser request appear to define a Telegram destination, even though only Fenrir can verify that the bot is an administrator in that group and has the **Invite Users** permission.

The public Gate also needed a protected way to issue a Telegram invite. A raw chat ID or an ordinary deep link cannot prove the visitor's identity, approval status, or entitlement to enter a particular group.

This change makes Fenrir's bot the source of truth for Telegram destinations and makes private access a server-authorized, short-lived handoff.

## Resulting member and owner journey

```text
Owner creates Gate (no Telegram mapping)
  -> adds @Myfenrir_bot to the target group as admin with Invite Users
  -> group admin runs /connect
  -> bot verifies admin capability and syncs a destination for its linked owner
  -> owner selects that verified destination in My Gates

Visitor opens /g/:slug
  -> MyFenrir SSO and linked Telegram identity
  -> Gate security preflight
  -> access request (or immediate owner access)
  -> owner grants access when review is required
  -> Community Bridge issues a 5-minute signed Telegram start payload
  -> bot validates the payload, visitor identity, and live bot permissions
  -> bot sends a one-member, expiring invite link in the visitor's private chat
```

## Implementation detail

### 1. Verified Telegram destinations only

`src/lib/gate.functions.ts` no longer accepts a `community_id` from Gate create or update requests. A Gate is created unassigned, and the browser can only attach a destination through `assignVerifiedTelegramDestination`.

That server function re-checks all of the following before saving a mapping:

- the Gate belongs to the signed-in user;
- the selected destination belongs to the same user;
- its provider is `telegram`;
- its status is `verified`.

The selector in `src/routes/gates.index.tsx` displays only records returned by `listVerifiedTelegramDestinations`. No free-text Telegram name or chat ID is accepted.

The bot-side ingress is `src/routes/api.internal.telegram-destination.ts`. It requires a bearer secret, resolves the Telegram identity through the linked MyFenrir account, and writes a verified `cb_community_destinations` record only after receiving explicit `botAdmin: true` and `canInviteUsers: true` capabilities.

### 2. Public Gate has no raw Telegram destination

`src/routes/g.$slug.tsx` no longer embeds a Telegram chat ID in a public action URL. An incomplete Gate is visibly marked **Telegram setup pending**.

For a ready Gate, the visitor progresses through MyFenrir SSO, then the server-side Gate preflight. The preflight confirms a linked Telegram identity and checks the configured handle screen. It returns one of:

- `ok` — request may proceed;
- `review` — owner approval is required;
- `blocked` — no invite can be issued;
- `sso_required` — return through MyFenrir identity linking.

`cb_gate_access_requests` stores the request and its lifecycle: `pending`, `granted`, `denied`, or `revoked`. Only the owner of the Gate may decide a request. Owners are granted an immediate handoff for their own Gate; other visitors need a granted request.

### 3. Signed Gate-to-Telegram handoff

`createGateTelegramHandoff` creates a compact token that contains:

- protocol version;
- the linked Telegram user ID;
- the verified Telegram chat ID;
- expiry timestamp;
- cryptographically random nonce;
- a 128-bit truncated HMAC-SHA-256 tag.

It is bound to the current MyFenrir user and has a five-minute TTL. The token stays within Telegram's 64-character `start` payload limit.

`fenrir-stars-payments.js` accepts that token only in the matching visitor's private chat. It rejects a bad signature, expired ticket, malformed token, or different Telegram user. Before inviting, it also re-checks that the bot is still an administrator with Invite Users in the target group and that the visitor is not already a member. It then creates a `member_limit: 1` invite link that expires within the same five-minute window.

## Files changed by this fix

| Area | Main files |
| --- | --- |
| Gate mapping | `src/lib/gate.functions.ts`, `src/routes/gate.tsx`, `src/routes/gates.index.tsx`, `src/components/gate/gate-form.tsx` |
| Bot verification sync | `src/routes/api.internal.telegram-destination.ts`, `apps/fenrir-bridge/workers/fenrir-stars-payments.js` |
| Public access and approvals | `src/routes/g.$slug.tsx`, `src/lib/access.functions.ts`, `src/routes/access.tsx` |
| Persistence | `neon/schema.sql` |
| Telegram identity continuity | `apps/fenrir-bridge/functions/api/telegram/link/confirm.ts` |
| Automated coverage | `apps/fenrir-bridge/functions/__tests__/gate-telegram-handoff.test.ts` |

## Required deployment work

1. Review and commit only the intended Community Gate changes; the repository currently contains unrelated uncommitted work.
2. Apply the new `cb_gate_access_requests` definition from `neon/schema.sql` to the Community Bridge Neon database.
3. Set `COMMUNITY_BRIDGE_DESTINATION_SYNC_SECRET` to the same randomly generated value in:
   - Community Bridge;
   - `fenrir-stars-payments` Worker.
4. Set `FENRIR_GATE_ACCESS_SECRET` to a different randomly generated value in those same two deployments.
5. Do not commit either secret, put either in `wrangler.fenrir-stars.toml`, or expose either in a client-side environment variable.
6. Deploy Community Bridge and the `fenrir-stars-payments` Worker together. A one-sided deployment leaves destination sync or invite redemption unavailable.

## Acceptance checklist

- [ ] Link a test MyFenrir account to Telegram.
- [ ] Add the bot to a safe test group as admin and grant **Invite Users**.
- [ ] Run `/connect` as a group admin.
- [ ] Confirm the group appears in **My Gates** as a verified destination.
- [ ] Assign it to a Gate and verify the Gate changes from pending to live only when bot readiness is healthy.
- [ ] Open `/g/:slug` as a different linked test account; confirm SSO and security preflight occur before any Telegram action.
- [ ] Confirm a reviewed visitor cannot receive an invite before owner approval.
- [ ] Grant the request, choose **Continue to Telegram**, and verify the bot sends a one-use invite in the correct private chat.
- [ ] Verify tampering, expiry, replay from another Telegram account, missing bot permissions, and an unlinked identity produce no invite.

## Automated verification already present

`apps/fenrir-bridge/functions/__tests__/gate-telegram-handoff.test.ts` verifies that a valid compact ticket is accepted for its exact Telegram identity and that tampered, expired, and wrong-account tickets are rejected.

Run the relevant test suite from the repository root before deployment, then perform the live acceptance test above because bot admin permissions and deployment secrets cannot be proven by unit tests.

## Operational notes

- A Gate without a verified mapping is intentionally non-actionable; this is a safety state, not a broken public page.
- The identity link and access grant are independent controls: a linked Telegram account alone does not grant access to a private group.
- A group mapping may be changed only to another destination independently verified for the same owner.
- The bot performs the final permission check at invite time, so a group whose admin permissions changed after `/connect` cannot silently issue invites.
