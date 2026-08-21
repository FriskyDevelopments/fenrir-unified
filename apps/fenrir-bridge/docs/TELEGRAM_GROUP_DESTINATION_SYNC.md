# Verified Telegram group → Community Bridge

This handoff makes the dashboard's **Verified Telegram group** selector real.
It never accepts a typed group name or browser-provided chat ID.

## User flow

1. The owner links their MyFenrir account to Telegram.
2. They add `@Myfenrir_bot` to the intended group, make it an admin, and allow
   **Invite Users**.
3. A Telegram group admin sends `/connect` inside that group.
4. The bot verifies the caller is an admin and that it has Invite Users.
5. The bot sends the verified destination to Community Bridge. The owner can
   then select it from **My Gates** for a specific Gate.

## Deployment configuration

Set the same randomly generated value as a Worker secret in both deployments;
never commit it or put it in `wrangler.fenrir-stars.toml`.

- Community Bridge: `COMMUNITY_BRIDGE_DESTINATION_SYNC_SECRET`
- `fenrir-stars-payments`: `COMMUNITY_BRIDGE_DESTINATION_SYNC_SECRET`

Optional in `fenrir-stars-payments` when targeting a non-production Community
Bridge deployment:

- `COMMUNITY_BRIDGE_DESTINATION_SYNC_URL`

The production default is:

`https://communities.myfenrir.com/api/internal/telegram-destination`

## Acceptance test

Use a safe test group and linked test owner:

1. Confirm the bot is an administrator with **Invite Users**.
2. Send `/connect` as that group admin.
3. Expect the bot confirmation message.
4. Open MyFenrir → **My Gates** and confirm the group appears in the verified
   dropdown.
5. Select it for a Gate and verify the public Gate becomes actionable only
   after the bot's readiness check is healthy.

Failure modes are deliberate: unlinked identities, non-admin callers, missing
bot permissions, and a missing sync secret do not create a destination.
# Secure Gate handoff

Public Gates never send a raw Telegram chat ID to the bot. When a signed-in
visitor with a linked Telegram account presses **Continue to Telegram**,
Community Bridge creates a five-minute signed `start` payload bound to that
visitor and to the bot-verified Telegram group. The payload is short enough for
Telegram's 64-character deep-link limit.

The payment worker accepts it only in the matching user's private chat,
validates the signature and expiry, rechecks that the bot is still an admin with
Invite Users, and then sends a `member_limit: 1` invite link. A modified,
replayed after expiry, or cross-account payload never yields an invite.

`FENRIR_GATE_ACCESS_SECRET` must be installed as the same secret in both the
Community Bridge deployment and the `fenrir-stars-payments` Worker. Do not put
it in `wrangler.fenrir-stars.toml` or any client bundle.
