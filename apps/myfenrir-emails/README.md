# myfenrir-emails

Branded **transactional + auth email** for MyFenrir, on Cloudflare. One render
engine, a white-label brand model, and a transport-agnostic provider layer:

- **Default rail:** Cloudflare Email Service — native `env.EMAIL.send()` binding,
  no API keys, sends from the verified root domain `myfenrir.com`.
- **No provider fallback in production:** delivery stays on Cloudflare Email
  Service. The provider adapters remain available for development but the
  configured fallback chain is empty.

This mirrors the proven `folios-emails` / `hostcasa-emails` pattern, restyled to
MyFenrir's dark "Fenrir / THE PACK" identity.

## Why a dedicated Worker

`fenrir-bridge` is a Cloudflare **Pages** project, and wrangler rejects the
`send_email` binding for Pages (see `apps/fenrir-bridge/wrangler.jsonc`). So
Pages cannot bind Cloudflare Email Service directly — its billing/magic-link
mail effectively no-ops until the binding gets "a real home." **This Worker is
that home.** Pages Functions call it over HTTP via
`functions/_lib/myfenrir-emails.ts`.

## Layout

```
src/
  index.ts              Worker: /health · / · /preview/<t>?brand= · POST /send · email()
  layout.ts             dark cosmic shell (hero + card + footer), image-free
  components.ts         button, codeBox (OTP), dataTable, callout, steps, pills…
  format.ts             esc / dates / code spacing / name helpers
  brands/               white-label model + `myfenrir` tokens + resolveBrand()
  providers/            cloudflare (default) · resend · mailersend · dispatch+fallback
  templates/            verificacion-codigo · acceso · bienvenida · cuenta-vinculada · notificacion
scripts/
  render-previews.ts    → previews/*.html (all templates × brands)
  send-test.ts          real send via Resend (op-injected key)
```

## Templates

| id | Purpose | Key `data` fields |
|----|---------|-------------------|
| `verificacion-codigo` | Account verification / OTP | `codigo`, `minutos`, `nombre`, `accion` |
| `acceso` | Magic link / passwordless login | `url`, `minutos`, `comunidad`, `nombre` |
| `bienvenida` | Welcome after signup | `nombre`, `plan`, `ctaUrl` |
| `cuenta-vinculada` | Telegram account linked | `telegramUsername`, `telegramNombre`, `email`, `fechaISO` |
| `notificacion` | Generic (billing, alerts, community) | `titulo`, `parrafos[]`, `etiqueta`, `ctaLabel`, `ctaUrl`, `tono` |
| `activacion-identidad` | Activate a MyFenrir identity | `nombre`, `email`, `ctaUrl`, `minutos` |
| `invitacion-lore` | Invite an activated member into LORE | `nombre`, `email`, `ctaUrl`, `motivo` |
| `continuar-lore` | Resume an incomplete LORE journey | `nombre`, `email`, `aura`, `ctaUrl` |

All templates emit responsive HTML **and** a plain-text fallback, use only inline
CSS + system fonts, and make **no external requests** (the logo is a CSS wordmark
by default; a hosted PNG can be opted in via `brand.logoUrl`).

## API

`POST /send` (Bearer `SEND_AUTH_TOKEN`):

```jsonc
{
  "template": "acceso",
  "to": "someone@example.com",
  "brand": "myfenrir",            // or an inline brand object (white-label)
  "data": { "url": "https://www.myfenrir.com/...", "minutos": 15 },
  "provider": "cloudflare",        // optional override; else EMAIL_PROVIDER
  "subject": "…"                   // optional; else template subject
}
```

`GET /health` reports provider, fallback chain, binding status, templates, brands.
`GET /preview/<template>?brand=myfenrir` renders a template with sample data.
`GET /` serves the responsive **MyFenrir Signal Email Studio**, a production
catalog for visually inspecting every live template on desktop and mobile. Its
UI Verse-inspired **Signal Prism** pattern adds an orbital sigil, reactive
spotlight, holographic card depth and pointer tilt; motion is disabled on mobile
and under `prefers-reduced-motion` while email markup remains client-safe.

## Develop

```bash
npm install
cp .dev.vars.example .dev.vars      # fill SEND_AUTH_TOKEN (+ RESEND_API_KEY to test fallback)
npm run previews                    # eyeball previews/index.html
npm test                            # Worker API, auth and dispatch contract
npm run typecheck
npm run dev                         # wrangler dev (remote EMAIL binding)
```

Production: **https://emails.myfenrir.com**. Deploy + DNS evidence: see
**DEPLOY.md**. Event wiring: see **WIRING.md**.
