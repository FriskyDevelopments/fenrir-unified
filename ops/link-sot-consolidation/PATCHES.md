# Anchored edits to EXISTING files

These are delivered as anchored snippets (not `git apply` diffs) because two of the
target files — `functions/api/telegram/webhook.ts` and
`workers/fenrir-stars-payments.js` — are being actively edited by the in-progress
bot task. Anchored insertions merge cleanly regardless of that WIP. Each block is
additive; nothing existing is removed.

New files (copy into place, no conflicts) — see the mirrored tree in this folder:
- `apps/fenrir-bridge/functions/_lib/account-links.ts`
- `apps/fenrir-bridge/functions/_lib/stripe-anchor.ts`
- `apps/fenrir-bridge/functions/api/telegram/link/confirm.ts`
- `apps/fenrir-bridge/functions/api/telegram/link.ts`  (replaces the current generator; SoT dual-write + SoT-first read)
- `apps/fenrir-bridge/supabase/migrations/2026080916000?_*.sql`
- `apps/community-bridge/src/lib/mcp/tools/get-my-account.ts`  (replaces)
- `apps/community-bridge/src/lib/mcp/tools/link-telegram-account.ts`  (replaces)

> Routing note: Cloudflare Pages Functions allow a file `link.ts` and a folder
> `link/` to coexist (`/api/telegram/link` + `/api/telegram/link/confirm`). If your
> router objects, `git mv functions/api/telegram/link.ts functions/api/telegram/link/index.ts`
> and change its two `_lib` imports from `../../_lib` to `../../../_lib`.

---

## 1) `apps/fenrir-bridge/functions/api/telegram/webhook.ts`  (Pages webhook — in-process SoT write)

This path already has `SUPABASE_SERVICE_ROLE_KEY`, so it writes the SoT directly.

**Add import (top, with the other imports):**
```ts
import { consumeLinkCode } from "../../_lib/account-links";
```

**Anchor** — inside `handleMessage`, immediately AFTER this existing block:
```ts
    const result = await consumeTelegramAccountLinkCode(env, env.DB!, linkCode, {
      telegramUserId: String(message.from?.id ?? message.chat.id),
      telegramChatId: String(message.chat.id),
      telegramUsername: message.from?.username,
      telegramFirstName: message.from?.first_name
    });
```
**Insert:**
```ts
    // Canonical SoT write (public.account_links). The D1 consume above is the cache/queue.
    if (result.ok) {
      await consumeLinkCode(env, {
        code: linkCode,
        telegramId: String(message.from?.id ?? message.chat.id),
        telegramUsername: message.from?.username ?? null,
        telegramFirstName: message.from?.first_name ?? null
      }).catch((e) => console.error("account_links_write_failed", String(e)));
    }
```

---

## 2) `apps/fenrir-bridge/workers/fenrir-stars-payments.js`  (standalone bot — calls the writer endpoint)

The worker has no service-role key, so it CALLS `POST /api/telegram/link/confirm`
(HMAC-signed) — it never writes the SoT directly.

**Anchor** — inside the webhook message handler, AFTER:
```js
  const linkCode = linkCodeFromStart(text);
  if (linkCode) {
    const result = await consumeTelegramLinkCode(env, linkCode, message);
```
**Insert (right after that `const result = ...` line):**
```js
    // Canonical SoT write via MyFenrir. D1 above is only the cache/queue.
    if (result.ok) {
      await notifyLinkConfirm(env, {
        code: linkCode,
        telegramId: String(message.from?.id || message.chat.id),
        telegramUsername: message.from?.username || null,
        telegramFirstName: message.from?.first_name || null
      }).catch((e) => console.error("link_confirm_failed", String(e)));
    }
```

**Add these helpers near the other top-level `async function`s:**
```js
async function notifyLinkConfirm(env, payload) {
  const url = (env.FENRIR_LINK_CONFIRM_URL || "").trim();
  const secret = (env.TELEGRAM_LINK_CONFIRM_SECRET || "").trim();
  if (!url || !secret) return; // not configured yet → D1 still holds the queue
  const body = JSON.stringify(payload);
  const sig = await hmacHex(secret, body);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-fenrir-link-signature": sig },
    body
  });
  if (!res.ok) throw new Error(`confirm_${res.status}`);
}

async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

**Config** — in `wrangler.fenrir-stars.toml` add under `[vars]` (URL is not a secret):
```toml
FENRIR_LINK_CONFIRM_URL = "https://www.myfenrir.com/api/telegram/link/confirm"
```
and set the shared secret WITHOUT putting it in git:
```bash
wrangler secret put TELEGRAM_LINK_CONFIRM_SECRET --config wrangler.fenrir-stars.toml
# same value goes to the Pages project so confirm.ts can verify:
#   1Password → Cloudflare Pages env var TELEGRAM_LINK_CONFIRM_SECRET (fenrir-bridge)
```

> Idempotency: if BOTH webhook paths happen to run, the second `consumeLinkCode`
> finds the SoT code already `consumed` (→ `not_found`) and the `account_links`
> upsert is a no-op. Safe.

---

## 3) `apps/fenrir-bridge/functions/api/stripe/webhook.ts`  (Stripe anchor)

**Add import:**
```ts
import { anchorStripeCustomer } from "../../_lib/stripe-anchor";
```
**Anchor** — right AFTER the existing:
```ts
  await upsertCustomer(db, {
    frisky_org_id: orgId,
    frisky_user_id: friskyUserId,
    stripe_customer_id: customerId,
    email,
  });
```
**Insert:**
```ts
  // Mirror the SAME customer onto the canonical Supabase identity (no 2nd customer).
  await anchorStripeCustomer(env, {
    stripe_customer_id: customerId,
    frisky_org_id: orgId,
    frisky_user_id: friskyUserId,
    email,
  }).catch(() => {});
```
(`env` is `context.env` in that handler — pass whichever identifier is in scope.)

---

## 4) `apps/fenrir-bridge/functions/api/trial/setup-intent.ts`  (Stripe anchor — trial path)

This is the trial system's customer-creation site. It already REUSES the existing
`billing_customers` customer before creating one, so we do not duplicate — we only
mirror onto the SoT.

**Add import:**
```ts
import { anchorStripeCustomer } from "../../_lib/stripe-anchor";
```
**Anchor** — right AFTER the existing `await upsertCustomer(db, { ... })` block:
```ts
  await anchorStripeCustomer(context.env, {
    stripe_customer_id: customerId,
    frisky_org_id: session.frisky_org_id,
    frisky_user_id: session.frisky_user_id,
    email: session.email,
  }).catch(() => {});
```

---

## 5) `apps/community-bridge/src/hooks/use-auth.tsx`  (read linked from SoT)

**Anchor** — replace the body of `loadRole`'s Supabase read. Current:
```tsx
    const { data, error } = await supabase
      .from("user_roles")
      .select("role, telegram_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!error && data) {
      setRole((data.role as AppRole) ?? "user");
      setTelegramId(data.telegram_id ? Number(data.telegram_id) : null);
    } else {
      setRole("user");
      setTelegramId(null);
    }
```
**Replace with** (role from user_roles; telegram link from the canonical account_links):
```tsx
    const [roleRes, linkRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      supabase
        .from("account_links")
        .select("telegram_id, status")
        .eq("provider", "telegram")
        .eq("status", "linked")
        .maybeSingle(), // RLS → the caller's own row only
    ]);
    setRole((roleRes.data?.role as AppRole) ?? "user");
    const tg = linkRes.data?.telegram_id;
    setTelegramId(tg ? Number(tg) : null);
```
