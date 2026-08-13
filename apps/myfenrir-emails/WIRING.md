# Wiring MyFenrir emails to real events

The `myfenrir-emails` Worker renders + sends. Producers (Pages Functions, the
Telegram workers, Supabase hooks) call it with a small payload. A ready-made
client already exists for the Pages side:

```
apps/fenrir-bridge/functions/_lib/myfenrir-emails.ts
  -> sendMyFenrirEmail(env, { template, to, data, subject?, brand? })
```

It POSTs to the Worker when `MYFENRIR_EMAILS_URL` (+ `MYFENRIR_EMAILS_TOKEN`)
are set, and otherwise falls back to the Pages `env.EMAIL` binding with a
compact on-brand shell — so nothing regresses if the Worker isn't wired yet.

Set on the `fenrir-bridge` Pages project:

| Key | Kind | Value |
|-----|------|-------|
| `MYFENRIR_EMAILS_URL` | var | `https://myfenrir-emails.<subdomain>.workers.dev` (or `https://emails.myfenrir.com`) |
| `MYFENRIR_EMAILS_TOKEN` | secret | must equal the Worker's `SEND_AUTH_TOKEN` |

---

## 1. Magic link / login — DONE (applied, non-destructive)

`functions/api/community-auth/magic-link/request.ts` now calls
`sendMyFenrirEmail(env, { template: "acceso", to, data: { url, minutos, comunidad } })`
instead of the old inline `<p>` email. Same response contract and error codes.

## 2. Account verification / code — `template: "verificacion-codigo"`

Use wherever MyFenrir issues its own short code (sign-up email verification or
step-up). Example call site: a `POST /api/auth/verify/request` handler.

```ts
import { sendMyFenrirEmail } from "../../../_lib/myfenrir-emails";

await sendMyFenrirEmail(context.env, {
  template: "verificacion-codigo",
  to: email,
  data: { codigo: code, minutos: 15, nombre, accion: "verificar tu cuenta MyFenrir" },
});
```

> If verification is handled by Supabase Auth's built-in emails, brand it at the
> Supabase layer instead (Auth → Email Templates + custom SMTP). This template
> is for app-owned OTP flows so the look matches the rest of MyFenrir.

## 3. Welcome — `template: "bienvenida"`

Fire once, right after an account is first created / verified. Good spot: the
success branch of `magic-link/consume.ts` **the first time** a member resolves,
or wherever the Supabase user row is created.

```ts
await sendMyFenrirEmail(context.env, {
  template: "bienvenida",
  to: email,
  data: { nombre, plan, ctaUrl: "https://www.myfenrir.com/main" },
});
```

## 4. Telegram linked — `template: "cuenta-vinculada"`  ⚠️ apply on a clean branch

The link is finalized by `consumeTelegramLinkCode()` in
`functions/_lib/telegram-identity.ts`, invoked from
`functions/api/telegram/webhook.ts` and `workers/fenrir-stars-payments.js`.
**Both of those files are currently modified by the in-flight
`codex/fix-myfenrir-favicon` branch — do NOT edit them here.** When that work
lands, add, right after the identity row is written:

```ts
// after consumeTelegramLinkCode(...) succeeds and we have the linked row:
await sendMyFenrirEmail(env, {
  template: "cuenta-vinculada",
  to: row.email,
  data: {
    email: row.email,
    telegramUsername: row.telegram_username,
    telegramNombre: row.telegram_first_name,
    fechaISO: row.linked_at,
    ctaUrl: "https://www.myfenrir.com/main",
  },
});
```

> The Telegram workers are plain Workers, not Pages, so they can either import a
> copy of the tiny client or POST to the Worker `/send` directly with the same
> `{ template, to, data }` body + `Authorization: Bearer <SEND_AUTH_TOKEN>`.

## 5. Generic notifications / billing — `template: "notificacion"`

`functions/api/stripe/webhook.ts` already uses the legacy `sendBillingEmail`
(also modified on the in-flight branch). It can migrate to
`sendMyFenrirEmail(env, { template: "notificacion", to, data: { titulo, parrafos, ctaLabel, ctaUrl, tono } })`
when convenient — no rush; both coexist.

---

### Do-not-duplicate notes (coordination)

- Sender identity stays `noreply@myfenrir.com` (root domain SPF+DKIM). Never
  send from `mail.myfenrir.com`.
- Don't remove `functions/_lib/transactional-email.ts` — `stripe/webhook.ts`
  (in-flight) still imports `FENRIR_MAIL_FROM` / `sendBillingEmail` from it.
- `SUPABASE_SERVICE_ROLE_KEY` is unrelated to sending; the emails Worker never
  needs it. Keep that wiring where it already lives.
