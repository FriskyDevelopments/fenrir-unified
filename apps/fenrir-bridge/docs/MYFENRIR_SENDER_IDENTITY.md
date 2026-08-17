# MyFenrir sender identity — findings, verification, and what is left

**Date:** 2026-08-17 · **Status:** rail chosen, code wired, **verified with a real delivery**

The membership confirmation was going out as `noreply@hostcasa.app`. HostCasa is a
different product with different customers. That address was never a decision —
it was the only domain verified in the Resend account, so the code drifted to
whatever happened to deliver. To the person who just paid for The Pack it reads
as phishing.

Resend is now out of this path entirely. Not demoted to a fallback — removed. A
fallback that sends as another client's brand is worse than no fallback, and a
second rail is exactly how the drift happened. **One rail: Cloudflare Email
Sending on `myfenrir.com`.**

---

## 1. What is actually true

Checked against live DNS and the live Cloudflare account. Commands at the bottom.

| Domain | SPF | DKIM | MX | DMARC | Verdict |
|---|---|---|---|---|---|
| `myfenrir.com` | ✅ `v=spf1 include:_spf.mx.cloudflare.net ~all` | ✅ `cf2024-1._domainkey` | ✅ `route{1,2,3}.mx.cloudflare.net` | ❌ **absent** | **The identity that authenticates** |
| `mail.myfenrir.com` | ❌ none | ❌ none | ❌ none | ⚠️ `v=DMARC1; p=reject;` | **Unusable — hard-rejected** |
| `hostcasa.app` | ✅ | ✅ | — | `p=none` | Verified in Resend — **another product** |

### The `wrangler.toml` contradiction, resolved

`apps/myfenrir-emails/wrangler.toml` contradicted itself: a comment saying *"do
NOT use mail.myfenrir.com (DMARC p=reject, no SPF/DKIM → hard-rejected)"* sat
three lines above `DEFAULT_FROM_EMAIL = "noreply@mail.myfenrir.com"`.

**The comment was right, the value was wrong.** The root domain carries the
Cloudflare records; the subdomain publishes `p=reject` with nothing to pass.

The same wrong address was **also** in `src/brands/myfenrir.ts` as
`sender.email`, and that value *wins over* `DEFAULT_FROM_EMAIL` in `handleSend()`.
Fixing only the toml would have changed nothing. Both are corrected.

---

## 2. Workers Paid — active. The blocker does not exist.

An earlier note here listed "Workers Paid plan" as a prerequisite. It is a real
prerequisite, and it is **already satisfied**. Verified on the account, not assumed:

- **Account:** `e2a7eccb24c4836847fd14d08c499bd0` — *Hrgrrtks2p@privaterelay.appleid.com's Account*.
  This is the account `myfenrir-emails/wrangler.toml` targets, and the one the
  worker actually lives in. (The other account visible to this login is
  `f2ff2cc06d8377cfde522aa179361f28`, *Zainxantoine@gmail.com's Account* — not
  where the mail worker is.)
- **`myfenrir-emails` is already deployed** there. Live version
  `c78c0845-fa90-4cf3-9ce8-5b9fb29596e8`, deployed 2026-08-15.
- `wrangler versions view` on that live version reports the binding:
  **`env.EMAIL (unrestricted) → Send Email`**.
- `GET https://emails.myfenrir.com/health` → `200`, `"provider":"cloudflare"`,
  **`"emailBinding": true`**, `"fallback": []`.
- The `SEND_AUTH_TOKEN` secret is **already set** on it.

Cloudflare does not attach a working `send_email` binding on the Free plan, and
this one is live and sending. **Workers Paid is active on that account.** No plan
change is needed and nothing is blocked on billing.

*(Cost, for the record: Workers Paid is $5/month minimum per account. It is
already being paid.)*

---

## 3. Real delivery test — done, and it landed

Run through `wrangler dev --remote`, which binds the **live** Cloudflare Email
Sending service (`remote = true` on `[[send_email]]`). Nothing was deployed and
no production secret was rotated.

- **From:** `MyFenrir <noreply@myfenrir.com>` — display name **MyFenrir**, not
  the legal entity, not HostCasa.
- **Reply-to:** `hola@myfenrir.com`
- **To:** `babaji.alvarez@gmail.com` — chosen deliberately. The Cloudflare login
  is an Apple private-relay alias (`hrgrrtks2p@privaterelay.appleid.com`) which
  bounces, so it was not used.
- **Content:** the real confirmation, rendered by `membershipEmail()` from real
  facts (The Pack / 500 Stars / no end date).
- **Accepted:** HTTP 200, `provider: "cloudflare"`,
  Message-ID `<zC821ScD2R1XQvQvvMXcIcgzYD804WarMQ8f@myfenrir.com>`.
- **Delivered:** found in Gmail by exact `rfc822msgid:` search — 1 of 1, in the
  **Inbox**, not Spam and not Promotions. Sender shown as `noreply@myfenrir.com`,
  display name **MyFenrir**, subject *"Confirmed: you're in The Pack · MyFenrir"*.

**What was NOT verified:** the `Authentication-Results` header (the literal
`spf=pass dkim=pass dmarc=...` line). Gmail's "Show original" could not be opened
— another Chrome extension blocked clicking and scripting on that tab. Inbox
placement on Gmail for a first-time sending domain is strong evidence, but it is
evidence, not the header. Open the message → ⋮ → **Show original** to confirm in
one look.

---

## 4. What changed in code (still not deployed)

| File | Change |
|---|---|
| `workers/fenrir-membership-confirmed.js` | `sendViaResend` → `sendViaMyFenrirMail`; posts the rendered email to the mail Worker with `provider: "cloudflare"` pinned. `assertMyFenrirSender()` still rejects any From outside `myfenrir.com` before the request leaves. No fallback. |
| `wrangler.fenrir-membership-confirmed.toml` | `RESEND_API_KEY` removed from the secret list; `MYFENRIR_MAIL_URL` added (empty on purpose — unset fails loudly as `mail_not_configured`); `MYFENRIR_MAIL_TOKEN` documented. |
| `apps/myfenrir-emails/src/index.ts` | New `raw` shape on `POST /send` — a pre-rendered `{subject, html, text}`. The confirmation is built from fenrir-bridge D1 facts; moving that rendering into the mail service would drag billing knowledge into it. Same bearer, same brand sender, no fallback. |
| `apps/myfenrir-emails/src/brands/myfenrir.ts` | `sender.email` → `noreply@myfenrir.com`. |
| `apps/myfenrir-emails/wrangler.toml` | `DEFAULT_FROM_EMAIL` → `noreply@myfenrir.com`, both blocks. |
| `__verify__/render-and-send.mjs` | Sends through the mail Worker; reads its token from the environment (`op read`), never a literal. |

⚠️ **The live `myfenrir-emails` still has `DEFAULT_FROM_EMAIL = noreply@mail.myfenrir.com`.**
Every email it sends today that does not override the sender is going out from a
domain that publishes `p=reject` with no SPF or DKIM — i.e. being rejected. The
fix is committed and not yet deployed.

---

## 5. To go live — three commands

```sh
# 1. Deploy the mail worker (carries the sender fix + the raw endpoint)
cd apps/myfenrir-emails && npx wrangler deploy

# 2. Give the confirmation worker the mail worker's token, straight from 1Password.
#    Store it there first if it is not there yet — the Cloudflare secret cannot be
#    read back, so rotate: set the same new value on both workers.
cd ../fenrir-bridge
op read "op://FriskyDev-Infra/MyFenrir-Emails/SEND_AUTH_TOKEN" \
  | npx wrangler secret put MYFENRIR_MAIL_TOKEN --config wrangler.fenrir-membership-confirmed.toml

# 3. Point it at the mail worker, then deploy
#    set MYFENRIR_MAIL_URL = "https://emails.myfenrir.com" in
#    wrangler.fenrir-membership-confirmed.toml  [vars], then:
npx wrangler deploy --config wrangler.fenrir-membership-confirmed.toml
```

`MYFENRIR_MAIL_URL` is left empty in the repo on purpose: unset fails loudly and
is recorded, which is safer than a stale URL that silently 404s.

---

## 6. DNS — still Francisco's, still needed

Two records, in **Cloudflare → myfenrir.com → DNS → Records**. Both **DNS only**
(grey cloud; TXT is never proxied).

**Add** — the brand's root domain has no DMARC policy at all:

| Type | Name | Content | TTL | Proxy |
|---|---|---|---|---|
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:hola@myfenrir.com; fo=1` | Auto | DNS only |

Copy-paste value:

```
v=DMARC1; p=none; rua=mailto:hola@myfenrir.com; fo=1
```

Start at `p=none` to collect reports without risking delivery. Once the reports
are clean for a couple of weeks, tighten to `p=quarantine`, then `p=reject`.

**Delete** — an orphan that only breaks things:

| Type | Name | Current content | Action |
|---|---|---|---|
| `TXT` | `_dmarc.mail` | `v=DMARC1; p=reject;` | **Delete** |

`mail.myfenrir.com` has no SPF, no DKIM and no MX. The only thing that record
does is guarantee that anything ever sent from that subdomain is rejected. Delete
it, or provision the subdomain properly — but nothing needs it, so delete.

⚠️ Do **not** touch the existing root `TXT myfenrir.com` SPF record. Cloudflare
Email Sending depends on it.

---

## 7. Also worth doing, different system

The Stripe checkout reportedly shows the legal entity instead of the brand. Same
class of error as the wrong From name: **Stripe → Settings → Business → Public
business name** (and the statement descriptor beside it). Not touched here.

---

## 8. Re-run the checks

```sh
# myfenrir.com — SPF + DKIM should both return a record
dig +short TXT myfenrir.com
dig +short TXT cf2024-1._domainkey.myfenrir.com

# mail.myfenrir.com — p=reject and nothing else
dig +short TXT _dmarc.mail.myfenrir.com
dig +short TXT mail.myfenrir.com

# root DMARC — empty until the record above is added
dig +short TXT _dmarc.myfenrir.com

# the rail itself
curl -s https://emails.myfenrir.com/health | jq '{provider, emailBinding, fallback}'

# the live sender value (should read noreply@myfenrir.com after deploy)
cd apps/myfenrir-emails && npx wrangler deployments status --name myfenrir-emails
```
