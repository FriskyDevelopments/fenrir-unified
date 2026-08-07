# Bot OS ↔ MyFenrir community contract

Wire Frisky Bot OS `botType: "community"` blueprints into the Fenrir waiting-room / gatekeeper loop without forking Ghost into the Pages app.

## Ownership

| Layer | Owner | Responsibility |
|-------|-------|----------------|
| Admin shell | MyFenrir (`fenrir-bridge`) | Brand, membership review, Stars entitlement UI, readiness |
| Bot runtime | `fenrir-gatekeeper` Worker | Mute on join, welcome card, Mini App verify, one-time invite |
| Bot factory | Frisky Bot OS | Blueprint curator, export, deploy secrets via Infisical |
| Entitlement truth | D1 + Stars webhook | Paid access state; Bot OS records bot id/username only |

## Contract (v1)

Bot OS exports a community blueprint JSON that MyFenrir / gatekeeper consume:

```json
{
  "botType": "community",
  "botName": "Fenrir Waiting Room",
  "telegramUsername": "MyFenrirBot",
  "waitingRoomChatId": "-100…",
  "mainGroupChatId": "-100…",
  "miniAppUrl": "https://www.myfenrir.com/gate/verify",
  "gates": ["turnstile", "oauth", "rules", "vibe"],
  "inviteTtlSeconds": 300,
  "webhookPath": "/api/telegram/webhook"
}
```

## Deploy sequence

1. Curator completes Bot OS community session → export JSON.
2. Secrets land in Infisical (`TELEGRAM_BOT_TOKEN`, webhook secret).
3. Coolify / Azure / CF Worker deploy `fenrir-gatekeeper` with that config.
4. MyFenrir readiness shows `telegramBotConfigured` + `telegramStarsConfigured`.
5. Admin tests: join waiting room → Verify Now → invite → Stars unlock.

## Do not

- Put Bot OS Ghost UI inside myfenrir.com
- Let Bot OS own entitlement truth (Stars/D1 stay Fenrir)
- Use community gate cookies as Bot OS ops login
