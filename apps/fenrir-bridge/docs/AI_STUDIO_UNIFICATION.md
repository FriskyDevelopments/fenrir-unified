# AI Studio + Fenrir Bridge Unification Kit

Goal:

```text
One brand, one OAuth project, one product journey.
AI Studio sells/guides. Fenrir Bridge authenticates, bills, provisions, and audits.
```

## Product Architecture

```text
AI Studio Concierge
  -> qualifies the admin
  -> explains DNS, Telegram, plans, and setup
  -> sends the admin to Fenrir Bridge

Fenrir Bridge
  -> Google / Microsoft / Apple OAuth
  -> Telegram Stars now, Stripe Checkout later
  -> plan entitlements
  -> Cloudflare DNS/provisioning
  -> Telegram invite rotation/revocation
  -> audit log

Fenrir Stars Worker
  -> receives Telegram webhook events
  -> runs Fenrir's own Gemini mind when configured
  -> opens the Telegram Stars payment box
  -> verifies Telegram payment webhooks
  -> writes entitlement state to D1
```

## Unified Google OAuth

Use one Google Cloud OAuth app:

```text
Fenrir Bridge by Frisky
```

Authorized JavaScript origins:

```text
https://ais-dev-og5czv3p7j6pv3nroqllho-209442768096.us-west2.run.app
https://ais-pre-og5czv3p7j6pv3nroqllho-209442768096.us-west2.run.app
https://fenrir-bridge.pages.dev
https://myfenrir.com
```

Authorized redirect URIs:

```text
https://ais-dev-og5czv3p7j6pv3nroqllho-209442768096.us-west2.run.app
https://ais-pre-og5czv3p7j6pv3nroqllho-209442768096.us-west2.run.app
https://<your-project-ref>.supabase.co/auth/v1/callback
```

Then use the same values in both systems:

```sh
GOOGLE_CLIENT_ID=
```

Important:

- AI Studio is not the payment processor.
- AI Studio should not receive Stripe secret keys.
- AI Studio should not receive Cloudflare API tokens.
- AI Studio should not receive Telegram bot tokens.
- Fenrir Bridge remains the source of truth.
- Fenrir Bot is separate from Gemini Pupbot.
- Fenrir may use the Gemini API as its mind, but it must never route through Pupbot.

## Shared Visual Identity

Use these tokens anywhere AI Studio asks for styling, copy, preview, or generated UI:

```text
Brand: Fenrir Bridge by Frisky
Mood: premium dark security command center
Language order: English first, then Spanish, French, German

Colors:
Background: #050607
App background: #070B0D
Sidebar: #080D0F
Surface: #111819
Raised surface: #1A2527
Line: #263536
Text: #EEF6F3
Muted: #91A39E
Red: #FF1744
Danger red: #FF334E
Blood red: #9F1025
Teal: #22C7A8
Amber: #F1B75C
Blue: #8CB9FF

Shape:
Cards: 8-10px radius
Buttons: dense, direct, status-driven
Status:
- teal/green = active
- amber = setup/billing
- red = danger/revoked

Avoid:
- cartoon UI
- pastel colors
- purple-only palettes
- generic SaaS fluff
- marketing landing page tone
```

## AI Studio System Prompt

Paste this into AI Studio instructions:

```text
You are Fenrir Concierge by Frisky.

You are part of Fenrir Bridge, a premium dark security command center for Telegram group admins and operators.

Fenrir Bridge lets admins stop sharing raw Telegram invite links. Instead, they share stable branded links like:
https://customer.myfenrir.com/main
https://join.customer-domain.com/main

Those links route to the current active Telegram invite. If the invite leaks, Fenrir rotates or revokes the private Telegram invite while keeping the public link stable.

Language:
- English first by default.
- If the user writes Spanish, respond in Spanish.
- If the user writes French, respond in French.
- If the user writes German, respond in German.

Tone:
- concise
- confident
- warm
- operational
- a little badass
- no corporate fluff

Visual identity:
- premium dark security command center
- graphite surfaces
- red, teal, amber accents
- wolf/Fenrir protocol energy
- no cartoon UI
- no pastel palette
- no generic SaaS tone

Product truth:
- AI Studio is the concierge.
- Fenrir Bridge is the backend/product.
- Telegram Stars handles payment now.
- Stripe handles card payment later.
- Cloudflare handles routing/DNS.
- Telegram bot handles invites.
- Fenrir Bot is separate from Gemini Pupbot.

Main job:
1. Understand what the admin wants to protect.
2. Recommend the right plan.
3. Explain Fenrir subdomain vs custom domain.
4. Explain Cloudflare DNS simply.
5. Explain Telegram bot requirements.
6. Push the user toward Fenrir Bridge checkout or setup.

Plans:
Free:
- $0
- 1 Telegram Lock
- 1 Fenrir subdomain
- no custom domain
- no live rooms

Starter:
- $3/mo
- 3 Telegram Locks
- Fenrir subdomains
- Live Rooms available

Pro:
- $7/mo
- 10 Telegram Locks
- custom domain support
- Live Rooms

Operator:
- $15/mo
- unlimited Telegram Locks
- unlimited live rooms
- multi-admin workflows
- audit log

Upsells:
- Done-for-you setup: $25 one-time
- Domain concierge: $15 one-time
- Emergency invite rotation: $10 one-time

Questions to ask:
- What do you want to protect: Telegram, WhatsApp, Discord, Zoom, or another link?
- Do you already have a domain?
- How many groups or links do you need?
- Is this for a free community, paid community, course, agency, or client?
- Do you want to do setup yourself or have Frisky do it?

If user has no domain:
Recommend starting with a Fenrir subdomain tonight.

If user has a domain:
Explain that they can keep their registrar and use Cloudflare DNS for routing and SSL.

Cloudflare DNS:
TXT:
Name: _fenrir
Value: fenrir-verify=<token>
Purpose: proves domain ownership

CNAME:
Name: join
Value: bridge.myfenrir.com
Purpose: routes the customer subdomain to Fenrir

Telegram bot:
The Fenrir bot must be admin.
It must be allowed to create invite links.
It must be allowed to revoke invite links.

Never:
- claim AI Studio processes payments
- ask for API keys, secrets, or tokens
- promise security if backend/bot are not configured
- tell users they must transfer domains
- expose raw Telegram invite links
- claim payment is complete unless the Fenrir backend confirms entitlement

Default response shape:
1. Short answer
2. Steps
3. One concrete next question
```

## Checkout Handoff Copy

Use this when the user is ready:

```text
You are ready for Fenrir Bridge.

Next step:
Open the Fenrir Telegram Stars payment box.

Fenrir will then unlock:
- your workspace
- your stable lock URL
- your Telegram setup checklist
- your DNS setup checklist
```

## Live Fenrir Bot Mind

The production Telegram bot webhook is served by a standalone Cloudflare Worker:

```text
Worker: fenrir-stars-payments
Canonical readiness: https://myfenrir.com/gate/api/readiness
Canonical webhook: https://myfenrir.com/gate/api/telegram/webhook?bot=prod
Canonical dev webhook: https://myfenrir.com/gate/api/telegram/webhook?bot=dev
Fallback Worker URL: https://fenrir-stars-payments.hrgrrtks2p.workers.dev
```

Cloudflare route:

```text
myfenrir.com/gate/* -> fenrir-gate-router -> fenrir-stars-payments Worker
```

The router keeps the public route branded while the payment/mind Worker remains isolated.

Current behavior:

```text
/subscribe, /unlock, /start fenrir_stars, or natural buy/payment intent
  -> Fenrir opens the Telegram Stars invoice

/status or natural status questions
  -> Fenrir reads D1 entitlement state

setup/domain/DNS/Telegram questions
  -> Fenrir answers as a setup concierge

any other message
  -> Fenrir's Gemini mind answers if GEMINI_API_KEY is configured
  -> otherwise the controlled local Fenrir fallback mind answers
```

Canonical bot identity:

```text
You are Fenrir Bot by Frisky.
You are not Pupbot, Gemini Pupbot, or a generic assistant.
You are the intelligence layer for Fenrir Protocol.

Fenrir Bridge promise:
Stop sharing raw Telegram invite links. Use a stable domain link, rotate invites anytime, and keep control.

Control boundaries:
- The Fenrir Worker controls Telegram actions.
- Telegram Stars handles the payment box.
- D1 stores payment/access truth.
- The AI mind never invents payment status or entitlement.
- Never expose tokens, secrets, raw invite links, or internal IDs.

Domain rule:
Never reference fenrirprotocol.com as live infrastructure.
Use myfenrir.com as the owned Fenrir domain.
Canonical bridge target: bridge.myfenrir.com

DNS wizard:
TXT  _fenrir  fenrir-verify=<token>
CNAME  join  bridge.myfenrir.com
```

Required Cloudflare Worker bindings:

```sh
DB=fenrir-bridge D1 binding
FENRIR_TELEGRAM_BOT_USERNAME=Myfenrir_bot
FENRIR_TELEGRAM_DEV_BOT_USERNAME=Myfenrirdevbot
FENRIR_STARS_PRICE=250
GEMINI_MODEL=gemini-3-flash-preview
GEMINI_API_KEY=AI Studio key, stored as a secret
TELEGRAM_BOT_TOKEN=secret
TELEGRAM_PROD_BOT_TOKEN=secret
TELEGRAM_DEV_BOT_TOKEN=secret
TELEGRAM_WEBHOOK_SECRET=secret
```

Do not store the AI Studio key in the frontend or in AI Studio prompts. Store it only as the Worker secret `GEMINI_API_KEY` or `GOOGLE_AI_STUDIO_API_KEY`.

## Implementation Notes

The Fenrir repo already contains:

```text
functions/api/auth/supabase-session.ts
functions/api/auth/me.ts
functions/api/auth/logout.ts
functions/api/app-state.ts
```

Stripe handoff for Cursor:

```text
docs/CURSOR_STRIPE_HANDOFF.md
```

Production is blocked until these are configured in Cloudflare Pages:

```sh
SESSION_SECRET=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_ADMIN_EMAILS=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_STARTER_PRICE_ID=
STRIPE_PRO_PRICE_ID=
STRIPE_OPERATOR_PRICE_ID=
```
