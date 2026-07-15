# Fenrir Hub — consolidated entry group + self-rotating invite

Replaces the dead Telegram addlist folder. One **hub group** is the single door;
the bot rotates a fresh invite on a cron (old links die), gates joins, and serves
`/rooms` to reach the rest. All of it is **dormant until `HUB_CHAT_ID` is set**, so
the code is already deployed and changes nothing until you arm it.

Bot: **@Myfenrir_bot** · Worker: `fenrir-stars-payments`
(`fenrir-stars-payments.hrgrrtks2p.workers.dev`).

## Owner steps to arm it (≈3 min)

1. **Create (or pick) the hub group** in Telegram — this is what people join first.
   (I can't create a Telegram group headless.)
2. **Add @Myfenrir_bot as ADMIN** in that group with **"Invite Users via Link"**
   and **"Add Members"** permissions. For gated entry also turn on the group's
   *"Approve new members"* (join requests).
3. **Get the group's numeric chat id** (e.g. `-1001234567890`): forward any group
   message to `@RawDataBot`, or check `/hub_status` after step 4 fails once.
4. **Set the env var** (Cloudflare dashboard → Workers → `fenrir-stars-payments` →
   Settings → Variables → add `HUB_CHAT_ID = -100…`). Optional:
   - `HUB_POST_CHAT_ID` — where the invite auto-posts (default: the hub group)
   - `HUB_GATE_MODE` — `open` (link joins directly) · `request` (bot approves each
     join request — **default**) · `entitled` (approve only active-Stars members)
   - `HUB_INVITE_TTL_HOURS` (default 24) · `HUB_INVITE_MEMBER_LIMIT` (open mode only)
5. **Register the cron** (the wrangler token here lacks the schedules scope, so the
   auto-rotation trigger must be added in the dashboard): Workers →
   `fenrir-stars-payments` → **Triggers → Cron Triggers → Add** → `0 */12 * * *`
   (every 12h; change as you like). The `scheduled()` handler is already deployed.
6. **First rotation now:** DM the bot `/hub_rotate` (owner-only) — it creates the
   first invite, posts + pins it in the hub, and replies with the link. Or:
   `curl -X POST …/api/admin/hub/rotate -H "authorization: Bearer $FENRIR_ADMIN_TOKEN"`.

## Managing "the rest" (rooms)

From the hub, members tap **🌐 The Rooms** (on the Fenrir OS menu) or send `/rooms`.
Owner commands (DM the bot):
- `/rooms_add <Title> | <https://t.me/…>` — add/point a room (default tier `free`)
- `/rooms_clear` — hide all rooms
- `/hub_status` — current invite, expiry, gate mode, room count

Rooms are stored in D1 (`fenrir_hub_rooms`); the current/previous invites in
`fenrir_hub_invites` (previous links are revoked on each rotation).

## The stable public link (already wired into pupfrisky.com)

`https://t.me/Myfenrir_bot?start=hub` — opens the bot, which serves the **current**
rotating invite (or a "being set up" holding message until armed). This is the link
`pupfrisky.com/FR!SK¥.F!LES` now points to, so the site never needs updating again
even though the invite itself rotates.

## Webhook note

Join requests need `chat_join_request` in the webhook's `allowed_updates` — the
worker's `sync-webhook` now sets it. Run once (also fixes Stars pre-checkout):
`curl -X POST …/api/admin/telegram/sync-webhook -H "authorization: Bearer $FENRIR_ADMIN_TOKEN" -H "content-type: application/json" -d '{"channel":"prod","target_url":"https://fenrir-stars-payments.hrgrrtks2p.workers.dev/api/telegram/webhook"}'`
