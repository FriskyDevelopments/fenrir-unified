# Bot OS ↔ MyFenrir community contract

Wire Frisky Bot OS `botType: "community"` blueprints into the Fenrir waiting-room / gatekeeper loop without forking Ghost into the Pages app.

## Ownership

| Layer | Owner | Responsibility |
|-------|-------|----------------|
| Admin shell | MyFenrir (`fenrir-bridge`) | Brand, membership review, Stars entitlement UI, readiness |
| Bot runtime | `fenrir-gatekeeper` Worker | Private-DM waiting room, optional group staging, Mini App verify, one-time invite |
| Bot factory | Frisky Bot OS | Blueprint curator, export, deploy secrets via Infisical |
| Entitlement truth | D1 + Stars webhook | Paid access state; Bot OS records bot id/username only |

## Contract (v1)

Bot OS exports a community blueprint JSON that MyFenrir / gatekeeper consume:

```json
{
  "botType": "community",
  "botName": "Fenrir Waiting Room",
  "telegramUsername": "Myfenrir_bot",
  "waitingRoomMode": "bot_dm",
  "waitingRoomChatId": null,
  "mainGroupChatId": "-100…",
  "miniAppUrl": "https://gate.myfenrir.com",
  "gates": ["human", "identity", "rules", "vibe"],
  "inviteTtlSeconds": 600,
  "webhookPath": "/tg"
}
```

## Deploy sequence

1. Curator completes Bot OS community session → export JSON.
2. Secrets land in Infisical (`TELEGRAM_BOT_TOKEN`, webhook secret).
3. Coolify / Azure / CF Worker deploy `fenrir-gatekeeper` with that config.
4. MyFenrir readiness shows `telegramBotConfigured` + `telegramStarsConfigured`.
5. Admin tests: open bot DM → Verify Now → invite → protected group. If a
   community chooses `waitingRoomMode: "telegram_group"`, also verify mute,
   welcome-card pinning, and bot administrator permissions in that optional room.

The protected group is always required and the bot must be an administrator with
permission to create invite links. A separate Telegram waiting-room group is not
required: the private bot conversation is the default virtual waiting room.

## Do not

- Put Bot OS Ghost UI inside myfenrir.com
- Let Bot OS own entitlement truth (Stars/D1 stay Fenrir)
- Use community gate cookies as Bot OS ops login
