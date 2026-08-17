# MyFenrir sender identity — findings and what is still missing

**Date:** 2026-08-17 · **Status:** diagnosed, code corrected, **operator action required**

The membership confirmation was going out as `noreply@hostcasa.app`. HostCasa is a
different product with different customers. That address was never a decision —
it is the only domain verified in the Resend account, so the code drifted to
whatever happened to deliver. To the person who just paid for The Pack it reads
as phishing.

This is what was verified, what was changed, and what only Francisco can do.

---

## 1. What is actually true today

Checked against live DNS and the Resend API, not from memory. Anyone can re-run
the commands at the bottom.

| Domain | SPF | DKIM | MX | DMARC | Verdict |
|---|---|---|---|---|---|
| `myfenrir.com` | ✅ `v=spf1 include:_spf.mx.cloudflare.net ~all` | ✅ `cf2024-1._domainkey` | ✅ `route{1,2,3}.mx.cloudflare.net` | ❌ **absent** | **This is the identity that authenticates** |
| `mail.myfenrir.com` | ❌ none | ❌ none | ❌ none | ⚠️ `v=DMARC1; p=reject;` | **Unusable — hard-rejected** |
| `send.myfenrir.com` | ❌ none | — | ❌ none | — | Not provisioned |
| `hostcasa.app` | ✅ (+ `send.hostcasa.app` → amazonses) | ✅ `resend._domainkey` | — | `p=none` | Verified in Resend — **another product** |

Resend account, `GET /domains`:

```json
[ { "name": "hostcasa.app", "status": "verified" } ]
```

`myfenrir.com` is **not even added** to the Resend account.

### The `wrangler.toml` contradiction, resolved

`apps/myfenrir-emails/wrangler.toml` contradicted itself: a comment saying *"do
NOT use mail.myfenrir.com (DMARC p=reject, no SPF/DKIM → hard-rejected)"* sat
three lines above `DEFAULT_FROM_EMAIL = "noreply@mail.myfenrir.com"`.

**The comment was right, the value was wrong.** `mail.myfenrir.com` publishes
`p=reject` and has neither SPF nor DKIM, so every message from it fails DMARC and
is rejected outright. The value is now `noreply@myfenrir.com` in both the default
and `[env.production]` blocks.

---

## 2. What changed in code (no deploy)

- `wrangler.fenrir-membership-confirmed.toml` — `FENRIR_MAIL_FROM` is now
  `MyFenrir <noreply@myfenrir.com>`, plus `FENRIR_MAIL_REPLY_TO = hola@myfenrir.com`.
- `workers/fenrir-membership-confirmed.js` — `sendViaResend()` now calls
  `assertMyFenrirSender()` first. A From on any domain other than `myfenrir.com`
  (or a subdomain of it) **throws before the request leaves**, with
  `mail.myfenrir.com` rejected by name. There is no fallback to another brand.
- `apps/myfenrir-emails/wrangler.toml` — contradiction resolved, evidence recorded.

**Known consequence, and it is deliberate:** until the sender is provisioned this
send fails with `resend_403`. The failure is written to `membership_confirmations`
with a legible reason and is visible via `GET /membership/confirmations`.

A confirmation that does not arrive is a bug we can see and count. A confirmation
wearing HostCasa's name is a brand incident that cannot be taken back.

---

## 3. What Francisco needs to do — pick one

### Option A — route through Cloudflare Email Sending (recommended, **zero DNS**)

`myfenrir.com` is *already* authenticated for Cloudflare Email Sending: the SPF
`include:_spf.mx.cloudflare.net` and the `cf2024-1._domainkey` DKIM record on the
domain are Cloudflare's own. **Nothing to add in DNS.**

The Worker that owns this rail already exists — `apps/myfenrir-emails`, with the
`send_email` binding. What is missing:

1. Workers **Paid** plan on account `e2a7eccb24c4836847fd14d08c499bd0`
   (the `send_email` binding requires it).
2. Confirm `myfenrir.com` is enabled under **Email → Email Sending** in the
   Cloudflare dashboard.
3. Deploy `myfenrir-emails` and set its `SEND_AUTH_TOKEN` secret.
4. Point `fenrir-membership-confirmed` at it: `POST /send` on that Worker instead
   of calling Resend directly. *(One function swap in `sendViaResend`; it is not
   done here because it needs the deployed URL and the token.)*

This also removes the second sending rail, which is how the wrong-domain drift
happened in the first place.

### Option B — add `myfenrir.com` to Resend

Faster if the Workers plan is a blocker. In Resend: **Domains → Add Domain →
`myfenrir.com`**, region `us-east-1`, then publish what it shows.

Records to add in **Cloudflare → myfenrir.com → DNS → Records**. All of these are
**DNS only** (grey cloud — TXT and MX are never proxied):

| Type | Name | Value | TTL |
|---|---|---|---|
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com` (priority **10**) | Auto |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | Auto |
| TXT | `resend._domainkey` | *`p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCB…`* — **copy from the Resend dashboard, it is unique per domain** | Auto |

⚠️ Do **not** edit the existing root `TXT myfenrir.com` SPF record. Cloudflare
Email Sending uses it; Resend uses the separate `send.` subdomain. They coexist.

*(Shape confirmed against the records already live on `hostcasa.app`, which is
verified in the same Resend account — but the DKIM key value is per-domain and
must come from Resend.)*

### Either way — two records worth publishing

| Type | Name | Value | Why |
|---|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:hola@myfenrir.com` | The brand's root domain has **no DMARC policy at all**. Start at `p=none` to collect reports, tighten to `quarantine` once clean. |
| — | `_dmarc.mail` | **delete**, or provision `mail.myfenrir.com` properly | An orphan `p=reject` on a subdomain with no SPF/DKIM. It only exists to break things. |

---

## 4. The visible name, not just the address

The From name must read **MyFenrir**. Not "Frisky Developments LLC", not
"HostCasa". `FENRIR_MAIL_FROM` and `DEFAULT_FROM_NAME` are both `MyFenrir`.

Related, **not fixed here because it is a different system**: the Stripe checkout
is reportedly showing the legal entity instead of the brand. That is
**Stripe → Settings → Business → Public business name** (and the statement
descriptor next to it). Same class of error, worth doing in the same sitting.

---

## 5. Re-run the checks

```sh
# myfenrir.com — should show SPF + DKIM
dig +short TXT myfenrir.com
dig +short TXT cf2024-1._domainkey.myfenrir.com

# mail.myfenrir.com — should show p=reject and NOTHING else
dig +short TXT _dmarc.mail.myfenrir.com
dig +short TXT mail.myfenrir.com

# root DMARC — currently empty
dig +short TXT _dmarc.myfenrir.com

# what Resend will actually accept
curl -s -H "authorization: Bearer $(op read op://FriskyDev-Infra/Email/password)" \
  https://api.resend.com/domains
```
