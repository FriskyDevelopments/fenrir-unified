const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) }
  });

const nowIso = () => new Date().toISOString();

const starsPrice = (env) => {
  const parsed = Number.parseInt(env.FENRIR_STARS_PRICE || "250", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 250;
};

const botUsername = (env) => (env.FENRIR_TELEGRAM_BOT_USERNAME || "").replace(/^@/, "").trim();

const botToken = (env, channel) => {
  if (channel === "dev") return (env.TELEGRAM_DEV_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || "").trim();
  return (env.TELEGRAM_PROD_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || "").trim();
};

const normalizeText = (value) => (value || "").trim();
const BRIDGE_TARGET = "bridge.myfenrir.com";

// ═══ FENRIR GATE — Telegram Mini App + Cloudflare Turnstile ═══════════════════
// Join-request-based verification. Group must have "Approve new members" ON.
// Flow: user requests to join → bot DMs them a web_app button → Mini App renders
// Turnstile → passes → worker calls approveChatJoinRequest → user is in.

function gateEnabled(env) {
  return Boolean(normalizeText(env.TURNSTILE_SITE_KEY) && normalizeText(env.TURNSTILE_SECRET_KEY));
}

function gateMiniAppUrl(env) {
  return normalizeText(env.FENRIR_GATE_MINI_APP_URL) || "https://www.myfenrir.com/gate/app";
}

/** HMAC token so gate URLs cannot be spoofed. */
async function gateToken(env, chatId, userId) {
  const secret = normalizeText(env.TELEGRAM_WEBHOOK_SECRET) || "fenrir-gate-default";
  const data = `gate:${chatId}:${userId}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function verifyGateToken(env, chatId, userId, token) {
  const expected = await gateToken(env, chatId, userId);
  if (!token || !expected || token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** Load per-group branding from D1 (falls back to defaults). */
async function getGateGroup(env, chatId) {
  if (!env.DB) return null;
  return env.DB.prepare(
    `SELECT * FROM gate_groups WHERE chat_id = ? LIMIT 1`
  ).bind(String(chatId)).first().catch(() => null);
}

/** Handle chat_join_request — DM the user with a web_app Verify button. */
async function handleChatJoinRequest(env, channel, joinRequest) {
  if (!gateEnabled(env)) return false;

  const chatId = joinRequest.chat.id;
  const userId = joinRequest.from.id;
  const firstName = joinRequest.from.first_name || "";
  const chatTitle = joinRequest.chat.title || "this community";

  const token = await gateToken(env, chatId, userId);
  const miniAppBase = gateMiniAppUrl(env);
  const webAppUrl = `${miniAppBase}?chat=${chatId}&user=${userId}&token=${token}`;

  // Load per-group config for custom welcome text
  const groupConfig = await getGateGroup(env, chatId);
  const welcomeText = groupConfig?.welcome_text ||
    `You've requested to join ${chatTitle}.\n\nThis community is protected by Fenrir. Tap the button below to verify you're human, and you'll be approved instantly.`;

  try {
    await telegramApi(env, channel, "sendMessage", {
      chat_id: userId, // DM the user
      text: `👋 Hey${firstName ? ` ${firstName}` : ""}!\n\n${welcomeText}`,
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Verify Now", web_app: { url: webAppUrl } }
        ]]
      }
    });
  } catch (err) {
    // User may have never started the bot — can't DM them.
    // Nothing we can do; admin will see pending request in the group.
    console.warn(JSON.stringify({
      event: "gate_dm_failed",
      chatId, userId,
      error: err?.message,
      ts: nowIso()
    }));
  }
  return true;
}

/** Validate Turnstile siteverify response. */
async function verifyTurnstile(env, turnstileToken, ip) {
  const secret = normalizeText(env.TURNSTILE_SECRET_KEY);
  if (!secret) return { success: false, error: "turnstile_not_configured" };

  const formData = new URLSearchParams();
  formData.append("secret", secret);
  formData.append("response", turnstileToken);
  if (ip) formData.append("remoteip", ip);

  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: formData.toString()
  });
  const data = await resp.json().catch(() => null);
  if (!data) return { success: false, error: "turnstile_network_error" };
  return { success: Boolean(data.success), error: data["error-codes"]?.join(", ") || null };
}

/** Approve the user's join request after Turnstile passes. */
async function approveGateUser(env, channel, chatId, userId) {
  await telegramApi(env, channel, "approveChatJoinRequest", {
    chat_id: chatId,
    user_id: userId
  });
}

/** Handle POST /api/telegram/gate-approve. */
async function handleGateApprove(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "invalid_body" }, { status: 400 });

  const { chat, user, token, turnstile } = body;
  if (!chat || !user || !token || !turnstile) {
    return json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  // Verify our HMAC gate token
  const tokenValid = await verifyGateToken(env, chat, user, token);
  if (!tokenValid) {
    return json({ ok: false, error: "invalid_gate_token" }, { status: 403 });
  }

  // Verify Turnstile
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
  const turnstileResult = await verifyTurnstile(env, turnstile, ip);
  if (!turnstileResult.success) {
    return json({ ok: false, error: `turnstile_failed: ${turnstileResult.error || "unknown"}` }, { status: 403 });
  }

  // Approve the join request
  const channel = "prod"; // gate always uses prod bot
  try {
    await approveGateUser(env, channel, chat, user);
  } catch (err) {
    return json({ ok: false, error: `approve_failed: ${err?.message || "unknown"}` }, { status: 500 });
  }

  // Log approval
  if (env.DB) {
    await env.DB.prepare(
      `INSERT INTO gate_approvals (chat_id, user_id, approved_at) VALUES (?, ?, ?)`
    ).bind(String(chat), String(user), nowIso()).run().catch(() => {});
  }

  return json({ ok: true, approved: true });
}

/** Serve the Fenrir Gate Mini App HTML at /gate/app. */
function serveGateMiniApp(env, url) {
  const siteKey = normalizeText(env.TURNSTILE_SITE_KEY);
  const chatId = url.searchParams.get("chat") || "";
  const userId = url.searchParams.get("user") || "";
  const token = url.searchParams.get("token") || "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>Fenrir Gate</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0a0a0a;--card:#141414;--border:#222;--accent:#F59E0B;--success:#10B981;--error:#EF4444;--text:#fff;--muted:#888}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:16px}
.card{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:40px 28px;max-width:380px;width:100%;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,0.5)}
.logo{width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#EC4899);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:24px}
h1{font-size:1.3rem;font-weight:700;margin-bottom:6px}
.brand{color:var(--accent)}
p{color:var(--muted);font-size:0.85rem;margin-bottom:24px;line-height:1.5}
.cf-turnstile{display:flex;justify-content:center;margin-bottom:16px}
.status{margin-top:16px;font-size:0.85rem;padding:12px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid var(--border)}
.status.success{color:var(--success);border-color:rgba(16,185,129,0.3)}
.status.error{color:var(--error);border-color:rgba(239,68,68,0.3)}
.status.pending{color:var(--muted)}
.shield{font-size:2rem;margin-bottom:8px}
</style>
</head>
<body>
<div class="card">
<div class="shield">🛡️</div>
<div class="logo">🐺</div>
<h1><span class="brand">Fenrir</span> Gate</h1>
<p>Complete the verification below to join the community.</p>
<div class="cf-turnstile" data-sitekey="${siteKey}" data-callback="onVerify" data-theme="dark" data-size="normal"></div>
<div class="status pending" id="status">Waiting for verification...</div>
</div>
<script>
const TG = window.Telegram?.WebApp;
if(TG) TG.ready();

async function onVerify(turnstileToken){
  const s=document.getElementById('status');
  s.textContent='Verifying with Fenrir...';
  s.className='status pending';
  try{
    const r=await fetch('/api/telegram/gate-approve',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({chat:'${chatId}',user:'${userId}',token:'${token}',turnstile:turnstileToken})
    });
    const d=await r.json();
    if(d.ok&&d.approved){
      s.textContent='✅ Verified! You\\'ve been approved. Welcome to the community.';
      s.className='status success';
      if(TG) setTimeout(()=>TG.close(),2000);
    }else{
      s.textContent='Verification failed: '+(d.error||'unknown')+'. Try again.';
      s.className='status error';
      if(window.turnstile) turnstile.reset();
    }
  }catch(e){
    s.textContent='Network error. Please try again.';
    s.className='status error';
  }
}
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html;charset=utf-8",
      "cache-control": "no-store",
    }
  });
}

// ═══ END FENRIR GATE ══════════════════════════════════════════════════════════

const FENRIR_BOT_BRIEF = [
  "You are Fenrir Bot by Frisky.",
  "You are NOT Pupbot. You are NOT Gemini Pupbot. You are NOT a generic assistant.",
  "You are the intelligence layer for Fenrir Protocol and Fenrir Bridge.",
  "Fenrir Bridge helps Telegram group admins, creators, operators, and small businesses stop sharing raw Telegram invite links.",
  "Primary promise: stop sharing raw Telegram invite links. Use one stable branded domain link, rotate private Telegram invites anytime, and keep control.",
  "Stable link examples: https://customer.myfenrir.com/main and https://join.customer-domain.com/main.",
  "If a private invite leaks, Fenrir rotates or revokes the Telegram invite while the public URL keeps working.",
  "Brand: Frisky Developments. Product: Fenrir Bridge. Tone: sharp, calm, operational, premium, direct.",
  "Visual/message style: sleek modular Telegram 2026 update energy, dark command center, clean sections, compact operational labels.",
  "Default to English. If the user writes Spanish, answer in Spanish. If French, answer in French. If German, answer in German.",
  "CONTROL RULES:",
  "You do not directly control Telegram. You do not directly process payment. You do not directly verify payment. You do not own entitlement truth.",
  "The Fenrir Worker controls the bot. Telegram Stars handles the payment box. D1 stores payment and access truth.",
  "Never claim payment or access is active unless backend entitlement_status is active.",
  "Never invent payment status. Never expose bot tokens, API keys, secrets, raw invite links, or internal IDs.",
  "Never tell users to transfer their domain. Never say Cloudflare is required as registrar.",
  "Users can keep any registrar. DNS can still route through Cloudflare.",
  "Never reference fenrirprotocol.com as live infrastructure. Use myfenrir.com as the owned Fenrir domain.",
  `The canonical bridge target is ${BRIDGE_TARGET} unless changed in production config.`,
  "PAYMENT BEHAVIOR:",
  "If user asks to buy, pay, upgrade, subscribe, unlock, activate, use Stars, or similar: say you are opening the official Fenrir payment box.",
  "Explain Telegram Stars handles the transaction and Fenrir verifies access after Telegram confirms payment.",
  "If user asks for Stripe: explain Stripe Direct Billing is the professional card/invoice route for Pro and Operator, but only open it when the Stripe backend is configured. Otherwise say it is pending and offer Stars.",
  "Do not ask for card details. Do not pretend payment is complete.",
  "STATUS BEHAVIOR:",
  "If user asks status/access/active/paid/subscription/entitlement: use backend entitlement_status. If active, say Fenrir Protocol is active. If inactive, say access is not active yet and invite them to subscribe.",
  "SETUP BEHAVIOR:",
  "Setup path: choose Fenrir subdomain or custom domain; add Fenrir bot to Telegram group; make bot admin; allow create/revoke invite links; create bridge slug; share stable public URL; rotate/revoke raw Telegram invites when needed.",
  "DNS WIZARD:",
  "TXT: Type TXT, Name _fenrir, Value fenrir-verify=<token>, TTL Auto, Purpose proves domain ownership.",
  `CNAME: Type CNAME, Name join, Value ${BRIDGE_TARGET}, TTL Auto, Purpose routes the customer subdomain to Fenrir.`,
  "PLANS:",
  "Free $0: 1 Telegram Lock, 1 Fenrir subdomain, no custom domain, testing.",
  "Starter $3/mo or equivalent Stars: 3 Telegram Locks, Fenrir subdomains, small communities.",
  "Pro $7/mo or equivalent Stars: 10 Telegram Locks, custom domain support, paid groups, creators, small businesses.",
  "Operator $15/mo or equivalent Stars: unlimited Telegram Locks, multi-admin workflows, audit logs, agencies/operators.",
  "Upsells: done-for-you setup $25 one-time, domain concierge $15 one-time, emergency invite rotation $10 one-time.",
  "Recommendation map: one group -> Starter; paid group/course/VIP/client community -> Pro; many groups/clients/ops -> Operator; testing -> Free.",
  "Keep replies concise. Use clean bullets when useful. No corporate fluff."
].join("\n");

async function telegramApi(env, channel, method, body) {
  const token = botToken(env, channel);
  if (!token) throw new Error("missing_telegram_token");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(`telegram_api_failed:${method}`);
  return data;
}

async function createOrder(env, telegramUserId, telegramChatId, amount) {
  const payload = `fenrir_stars:${telegramUserId}:${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
  await env.DB.prepare(
    `INSERT INTO telegram_stars_orders (
      payload, telegram_user_id, telegram_chat_id, amount, status, created_at
    ) VALUES (?, ?, ?, ?, 'pending', ?)`
  )
    .bind(payload, telegramUserId, telegramChatId, amount, nowIso())
    .run();
  return payload;
}

async function getOrder(env, payload) {
  return env.DB.prepare(`SELECT * FROM telegram_stars_orders WHERE payload = ?`).bind(payload).first();
}

async function getEntitlement(env, telegramUserId) {
  return env.DB.prepare(`SELECT * FROM telegram_stars_entitlements WHERE telegram_user_id = ?`)
    .bind(String(telegramUserId))
    .first();
}

async function consumeTelegramLinkCode(env, code, message) {
  const pending = await env.DB.prepare(
    `SELECT * FROM telegram_account_link_codes
     WHERE code = ? AND status = 'pending'
     LIMIT 1`
  )
    .bind(code)
    .first();
  if (!pending) return { ok: false, reason: "not_found" };
  if (Date.parse(pending.expires_at) <= Date.now()) {
    await env.DB.prepare(`UPDATE telegram_account_link_codes SET status = 'expired' WHERE code = ?`).bind(code).run();
    return { ok: false, reason: "expired" };
  }

  const ts = nowIso();
  const telegramUserId = String(message.from?.id || message.chat.id);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM telegram_identity_links WHERE frisky_user_id = ? OR telegram_user_id = ?`).bind(
      pending.frisky_user_id,
      telegramUserId
    ),
    env.DB.prepare(
      `INSERT INTO telegram_identity_links (
        telegram_user_id, frisky_user_id, frisky_org_id, email,
        telegram_username, telegram_first_name, linked_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET
        frisky_user_id = excluded.frisky_user_id,
        frisky_org_id = excluded.frisky_org_id,
        email = excluded.email,
        telegram_username = excluded.telegram_username,
        telegram_first_name = excluded.telegram_first_name,
        updated_at = excluded.updated_at`
    ).bind(
      telegramUserId,
      pending.frisky_user_id,
      pending.frisky_org_id,
      pending.email,
      message.from?.username || null,
      message.from?.first_name || null,
      ts,
      ts
    ),
    env.DB.prepare(
      `UPDATE telegram_account_link_codes
       SET status = 'claimed',
           telegram_user_id = ?,
           telegram_chat_id = ?,
           telegram_username = ?,
           telegram_first_name = ?,
           claimed_at = ?
       WHERE code = ?`
    ).bind(
      telegramUserId,
      String(message.chat.id),
      message.from?.username || null,
      message.from?.first_name || null,
      ts,
      code
    )
  ]);
  return { ok: true, friskyUserId: pending.frisky_user_id, friskyOrgId: pending.frisky_org_id };
}

function linkCodeFromStart(text) {
  const match = text.match(/^\/start\s+link_([a-z0-9_-]{8,64})$/i);
  return match?.[1] || "";
}

async function markPaid(env, payment, message, order) {
  const ts = nowIso();
  const telegramUserId = String(message.from?.id || order?.telegram_user_id || message.chat.id);
  await env.DB.prepare(
    `UPDATE telegram_stars_orders
     SET status = 'paid', telegram_payment_charge_id = ?, paid_at = ?
     WHERE payload = ?`
  )
    .bind(payment.telegram_payment_charge_id, ts, payment.invoice_payload)
    .run();

  await env.DB.prepare(
    `INSERT INTO telegram_stars_entitlements (
      telegram_user_id, telegram_chat_id, status, stars_amount, currency,
      telegram_payment_charge_id, payload, created_at, updated_at
    ) VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET
      telegram_chat_id = excluded.telegram_chat_id,
      status = 'active',
      stars_amount = excluded.stars_amount,
      currency = excluded.currency,
      telegram_payment_charge_id = excluded.telegram_payment_charge_id,
      payload = excluded.payload,
      updated_at = excluded.updated_at`
  )
    .bind(
      telegramUserId,
      String(message.chat.id),
      payment.total_amount,
      payment.currency,
      payment.telegram_payment_charge_id,
      payment.invoice_payload,
      ts,
      ts
    )
    .run();
}

async function sendStarsInvoice(env, channel, message) {
  const amount = starsPrice(env);
  const payload = await createOrder(env, String(message.from?.id || message.chat.id), String(message.chat.id), amount);
  await telegramApi(env, channel, "sendInvoice", {
    chat_id: message.chat.id,
    title: env.FENRIR_STARS_TITLE || "Fenrir Protocol Access",
    description:
      env.FENRIR_STARS_DESCRIPTION ||
      "Unlock Fenrir Protocol access with Telegram Stars while card billing is being reviewed.",
    payload,
    provider_token: "",
    currency: "XTR",
    prices: [{ label: env.FENRIR_STARS_LABEL || "Fenrir Protocol Access", amount }],
    protect_content: true
  });
}

function paymentIntent(text) {
  return /\b(buy|pay|payment|subscribe|unlock|upgrade|pro|starter|operator|stars|checkout|pagar|comprar|suscribir|desbloquear|me interesa)\b/i.test(
    text
  );
}

function statusIntent(text) {
  return /^\/status\b/i.test(text) || /\b(status|access|active|paid|entitlement|estado|activo|pagado)\b/i.test(text);
}

function setupIntent(text) {
  return /^\/setup\b/i.test(text) || /\b(setup|domain|dns|telegram|bridge|link|cloudflare|dominio|configurar|grupo)\b/i.test(text);
}

function pricingIntent(text) {
  return /\b(price|pricing|plan|plans|free|starter|pro|operator|cost|cuanto|precio|planes|tarifa)\b/i.test(text);
}

function stripeIntent(text) {
  return /\b(stripe|card|credit|debit|invoice|billing portal|stripe pro|stripe operator|tarjeta|factura)\b/i.test(text);
}

function menuIntent(text) {
  return /^\/(start|menu|help)\b/i.test(text) || /\b(menu|commands|modulos|módulos|ayuda|help)\b/i.test(text);
}

function spanishIntent(text) {
  return /\b(si|sí|como|cómo|cuanto|precio|pagar|comprar|dominio|grupo|configurar|estado|activo|pagado|quiero|tengo)\b/i.test(text);
}

function modularMenuText(text, entitlement) {
  const active = entitlement?.status === "active";
  if (spanishIntent(text)) {
    return [
      "FENRIR BOT OS | Menu",
      `Estado: ${active ? "activo" : "pendiente"}`,
      "",
      "MOD 01 | Setup",
      "Dominio, DNS, bot admin y primer bridge.",
      "",
      "MOD 02 | Planes",
      "Free, Starter, Pro, Operator.",
      "",
      "MOD 03 | Pago",
      "Abre la caja oficial de Telegram Stars.",
      "",
      "MOD 04 | Estado",
      "Verifica si tu acceso esta activo.",
      "",
      "Comandos: /setup /plans /subscribe /status"
    ].join("\n");
  }
  return [
    "FENRIR BOT OS | Menu",
    `Status: ${active ? "active" : "pending"}`,
    "",
    "MOD 01 | Setup",
    "Domain, DNS, bot admin permissions, and first bridge.",
    "",
    "MOD 02 | Plans",
    "Free, Starter, Pro, Operator.",
    "",
    "MOD 03 | Payment",
    "Open the official Telegram Stars payment box.",
    "",
    "MOD 04 | Status",
    "Check whether backend entitlement is active.",
    "",
    "Commands: /setup /plans /subscribe /status"
  ].join("\n");
}

// --- Deterministic module screens (single source of truth) --------------------
// Each MOD button AND its slash command render the SAME screen from these builders.
// They never route through the LLM, so a module always opens its real content
// instead of the model reprinting the menu.

function setupScreen(text) {
  if (spanishIntent(text)) {
    return [
      "MOD 01 · SETUP — Fenrir Bridge",
      "Deja de compartir invitaciones crudas de Telegram: un link estable, invites rotables.",
      "",
      "PASOS:",
      "1. Elige un subdominio Fenrir o tu propio dominio.",
      "2. Agrega Fenrir Bot al grupo de Telegram.",
      "3. Hazlo administrador.",
      "4. Permítele crear y revocar enlaces de invitación.",
      "5. Crea el slug del bridge.",
      "6. Comparte el link público estable.",
      "",
      "DNS (dominio propio) — bridge target:",
      `• CNAME · Nombre: join · Valor: ${BRIDGE_TARGET} · TTL: Auto (enruta tu subdominio a Fenrir)`,
      "• TXT · Nombre: _fenrir · Valor: fenrir-verify=<token> · TTL: Auto (prueba de propiedad)",
      "",
      `Bridge target address: ${BRIDGE_TARGET}. Conservas tu registrador; no transfieres el dominio.`,
      "",
      "Siguiente: /plans · /subscribe · /status"
    ].join("\n");
  }
  return [
    "MOD 01 · SETUP — Fenrir Bridge",
    "Stop sharing raw Telegram invite links — one stable link, rotatable invites.",
    "",
    "STEPS:",
    "1. Choose a Fenrir subdomain or your own custom domain.",
    "2. Add Fenrir Bot to your Telegram group.",
    "3. Make the bot an admin.",
    "4. Allow it to create and revoke invite links.",
    "5. Create a bridge slug.",
    "6. Share the stable public URL.",
    "",
    "DNS (custom domain) — bridge target:",
    `• CNAME · Name: join · Value: ${BRIDGE_TARGET} · TTL: Auto (routes your subdomain to Fenrir)`,
    "• TXT · Name: _fenrir · Value: fenrir-verify=<token> · TTL: Auto (proves domain ownership)",
    "",
    `Bridge target address: ${BRIDGE_TARGET}. Keep any registrar; no domain transfer needed.`,
    "",
    "Next: /plans · /subscribe · /status"
  ].join("\n");
}

function plansScreen(text) {
  if (spanishIntent(text)) {
    return [
      "MOD 02 · PLANES — Fenrir Protocol",
      "",
      "Free — $0: 1 Telegram Lock, 1 subdominio Fenrir. Para probar.",
      "Starter — $3/mes o Stars: 3 Telegram Locks, subdominios Fenrir.",
      "Pro — $7/mes o Stars: 10 Telegram Locks, soporte de dominio propio.",
      "Operator — $15/mes o Stars: Locks ilimitados, multi-admin, audit logs.",
      "",
      "Un grupo → Starter. VIP/curso/comunidad de clientes → Pro. Muchos grupos o clientes → Operator.",
      "",
      "Paga con /subscribe (Telegram Stars)."
    ].join("\n");
  }
  return [
    "MOD 02 · PLANS — Fenrir Protocol",
    "",
    "Free — $0: 1 Telegram Lock, 1 Fenrir subdomain. For testing.",
    "Starter — $3/mo or Stars: 3 Telegram Locks, Fenrir subdomains.",
    "Pro — $7/mo or Stars: 10 Telegram Locks, custom domain support.",
    "Operator — $15/mo or Stars: unlimited Locks, multi-admin workflows, audit logs.",
    "",
    "One group → Starter. Paid VIP/course/client community → Pro. Many groups or clients → Operator.",
    "",
    "Pay with /subscribe (Telegram Stars)."
  ].join("\n");
}

function paymentScreen(text) {
  if (spanishIntent(text)) {
    return [
      "MOD 03 · PAGO — Telegram Stars",
      "Abriendo la caja oficial de pago de Telegram.",
      "",
      "Telegram Stars procesa la transacción; Fenrir verifica y activa tu acceso cuando Telegram confirma el pago.",
      "No pido datos de tarjeta y no confirmo el pago manualmente."
    ].join("\n");
  }
  return [
    "MOD 03 · PAYMENT — Telegram Stars",
    "Opening the official Telegram payment box.",
    "",
    "Telegram Stars handles the transaction; Fenrir verifies and activates your access once Telegram confirms payment.",
    "I never ask for card details and never confirm payment by hand."
  ].join("\n");
}

function statusScreen(entitlement, text) {
  const active = entitlement?.status === "active";
  if (spanishIntent(text)) {
    return active
      ? [
          "MOD 04 · ESTADO — Fenrir Protocol",
          "Acceso: ACTIVO",
          `Stars: ${entitlement.stars_amount || 0}`,
          "Modo: Telegram Stars"
        ].join("\n")
      : [
          "MOD 04 · ESTADO — Fenrir Protocol",
          "Acceso: PENDIENTE (todavía no activo)",
          "",
          "Usa /subscribe y abro la caja oficial de Telegram Stars para activarte."
        ].join("\n");
  }
  return active
    ? [
        "MOD 04 · STATUS — Fenrir Protocol",
        "Access: ACTIVE",
        `Stars: ${entitlement.stars_amount || 0}`,
        "Mode: Telegram Stars"
      ].join("\n")
    : [
        "MOD 04 · STATUS — Fenrir Protocol",
        "Access: PENDING (not active yet)",
        "",
        "Run /subscribe and I’ll open the official Telegram Stars box to activate you."
      ].join("\n");
}

async function sendText(env, channel, chatId, text) {
  await telegramApi(env, channel, "sendMessage", { chat_id: chatId, text });
}

// Parse a leading slash command: "/setup@Myfenrir_bot arg" -> { cmd:"setup", arg:"arg" }.
// Returns null when the text is not a slash command.
function parseCommand(text) {
  const m = /^\/([a-z0-9_]+)(?:@[\w]+)?(?:\s+([\s\S]*))?$/i.exec((text || "").trim());
  if (!m) return null;
  return { cmd: m[1].toLowerCase(), arg: (m[2] || "").trim() };
}

async function sendBotMenu(env, channel, message, entitlement) {
  await telegramApi(env, channel, "sendMessage", {
    chat_id: message.chat.id,
    text: modularMenuText(message.text || "", entitlement),
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🌐 MOD 01 · Setup", callback_data: "fenrir_setup" },
          { text: "🎟️ MOD 02 · Plans", callback_data: "fenrir_plans" }
        ],
        [
          { text: "⭐️ MOD 03 · Stars", callback_data: "fenrir_subscribe" },
          { text: "✅ MOD 04 · Status", callback_data: "fenrir_status" }
        ]
      ]
    }
  });
}

function fallbackMind(text, entitlement) {
  if (menuIntent(text)) return modularMenuText(text, entitlement);

  if (statusIntent(text)) return statusScreen(entitlement, text);

  if (pricingIntent(text)) return plansScreen(text);

  if (stripeIntent(text)) {
    return [
      "FENRIR PROTOCOL | Direct Billing",
      "Gateway: Stripe Secure",
      "Status: pending backend activation",
      "",
      "Stripe Direct Billing is the professional card and invoice route for Pro and Operator users.",
      "",
      "What it supports once active:",
      "• Card, Apple Pay, and Google Pay through Stripe Checkout",
      "• Stripe Customer Portal",
      "• Business invoices",
      "• Pro and Operator subscriptions",
      "",
      "For now, I can open the official Telegram Stars payment box. Telegram handles the transaction, and Fenrir activates access after confirmation."
    ].join("\n");
  }

  if (setupIntent(text)) return setupScreen(text);

  return [
    "FENRIR BOT OS | Menu",
    "Status: online",
    "",
    "MOD 01 | Setup",
    "Telegram bridge setup, DNS, bot permissions.",
    "",
    "MOD 02 | Plans",
    "Pricing and access limits.",
    "",
    "MOD 03 | Payment",
    "Official Telegram Stars payment box.",
    "",
    "MOD 04 | Status",
    "Backend entitlement check.",
    "",
    "Commands: /setup /plans /subscribe /status"
  ].join("\n");
}

async function geminiMind(env, input, entitlement) {
  const key = normalizeText(env.GEMINI_API_KEY || env.GOOGLE_AI_STUDIO_API_KEY);
  if (!key) return fallbackMind(input.text, entitlement);

  const model = normalizeText(env.GEMINI_MODEL) || "gemini-3-flash-preview";
  const prompt = [
    FENRIR_BOT_BRIEF,
    "",
    `entitlement_status: ${entitlement?.status || "none"}`,
    `stars_amount: ${entitlement?.stars_amount || 0}`,
    `user_message: ${input.text}`
  ].join("\n");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": key
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 420
      }
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) return fallbackMind(input.text, entitlement);
  const answer = data?.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join("\n").trim();
  return answer || fallbackMind(input.text, entitlement);
}

// Constant-time string comparison so we never leak the webhook secret via timing.
// Length is allowed to short-circuit (standard and acceptable for a fixed-length token).
function timingSafeEqualStr(a, b) {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

async function handleTelegramWebhook(request, env, url) {
  if (!env.DB) return json({ ok: false, error: "db_not_configured" }, { status: 500 });
  const channel = url.searchParams.get("bot") === "dev" ? "dev" : "prod";
  if (!botToken(env, channel)) return json({ ok: false, error: "missing_telegram_token" }, { status: 500 });

  // --- FAIL-CLOSED webhook authentication (audit finding H2) --------------------
  // Telegram signs every legitimate webhook POST with the secret registered via
  // setWebhook({ secret_token }), sent back in the x-telegram-bot-api-secret-token
  // header. We require that secret to be BOTH configured on this worker AND to match
  // the request. If it is missing OR wrong, the update is UNTRUSTED and we process
  // nothing below (no markPaid, no entitlement write, no bot reply). We return HTTP
  // 200 so Telegram does not enter its retry loop for forged/misconfigured traffic,
  // but we grant nothing and we log the rejection.
  //
  // Previous (VULNERABLE) behaviour was fail-OPEN: `if (configuredSecret && ...)` —
  // when TELEGRAM_WEBHOOK_SECRET was unset the check was skipped entirely, so a
  // forged `successful_payment` POST could self-grant a paid entitlement.
  const configuredSecret = normalizeText(env.TELEGRAM_WEBHOOK_SECRET);
  const presentedSecret = request.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!configuredSecret || !timingSafeEqualStr(presentedSecret, configuredSecret)) {
    console.warn(JSON.stringify({
      event: "telegram_webhook_rejected",
      reason: configuredSecret ? "secret_mismatch" : "secret_not_configured",
      channel,
      hasHeader: Boolean(request.headers.get("x-telegram-bot-api-secret-token")),
      ts: nowIso()
    }));
    // 200 => Telegram will not retry; ignored:true => we did not act on the update.
    return json({ ok: true, ignored: true }, { status: 200 });
  }
  // -----------------------------------------------------------------------------

  const update = await request.json().catch(() => null);
  if (!update) return json({ ok: false, error: "invalid_update" }, { status: 400 });

  // --- Fenrir Gate: chat_join_request (before any other handler) ----------------
  if (update.chat_join_request) {
    const handled = await handleChatJoinRequest(env, channel, update.chat_join_request);
    return json({ ok: true, gate: handled });
  }
  // -----------------------------------------------------------------------------

  if (update.pre_checkout_query) {
    const query = update.pre_checkout_query;
    const order = await getOrder(env, query.invoice_payload);
    const valid =
      query.invoice_payload?.startsWith("fenrir_stars:") &&
      order &&
      order.status === "pending" &&
      String(query.from.id) === String(order.telegram_user_id) &&
      query.currency === "XTR" &&
      query.total_amount === Number(order.amount);

    await telegramApi(env, channel, "answerPreCheckoutQuery", {
      pre_checkout_query_id: query.id,
      ok: Boolean(valid),
      error_message: valid ? undefined : "This Fenrir Stars invoice expired. Please run /subscribe again."
    });
    return json({ ok: true });
  }

  if (update.callback_query) {
    const query = update.callback_query;
    const callbackMessage = query.message || { chat: { id: query.from.id }, from: query.from, text: "" };
    const entitlement = await getEntitlement(env, query.from?.id || callbackMessage.chat.id);
    await telegramApi(env, channel, "answerCallbackQuery", {
      callback_query_id: query.id,
      text: "Fenrir module selected."
    });

    // MOD buttons render the SAME deterministic screens as their slash commands.
    const cbText = callbackMessage.text || "";
    if (query.data === "fenrir_subscribe") {
      await sendText(env, channel, callbackMessage.chat.id, paymentScreen(cbText));
      await sendStarsInvoice(env, channel, callbackMessage);
      return json({ ok: true });
    }
    if (query.data === "fenrir_setup") {
      await sendText(env, channel, callbackMessage.chat.id, setupScreen(cbText));
      return json({ ok: true });
    }
    if (query.data === "fenrir_plans") {
      await sendText(env, channel, callbackMessage.chat.id, plansScreen(cbText));
      return json({ ok: true });
    }
    if (query.data === "fenrir_status") {
      await sendText(env, channel, callbackMessage.chat.id, statusScreen(entitlement, cbText));
      return json({ ok: true });
    }
    await sendBotMenu(env, channel, callbackMessage, entitlement);
    return json({ ok: true });
  }

  const message = update.message;
  if (message?.successful_payment) {
    const payment = message.successful_payment;
    const order = await getOrder(env, payment.invoice_payload);
    // Defense-in-depth (audit finding H2, second layer): the request is already
    // secret-authenticated above, so only Telegram can reach this line. We ADDITIONALLY
    // grant only when the payment maps to a real, still-pending order for THIS user,
    // currency (XTR) and exact amount — mirroring the bridge Pages Function handler
    // (functions/api/telegram/webhook.ts). A payment signal that does not match an
    // order changes NOTHING.
    const telegramUserId = String(message.from?.id || order?.telegram_user_id || message.chat.id);
    const valid =
      payment.invoice_payload?.startsWith("fenrir_stars:") &&
      order &&
      order.status === "pending" &&
      String(order.telegram_user_id) === telegramUserId &&
      payment.currency === "XTR" &&
      payment.total_amount === Number(order.amount);
    if (!valid) {
      console.warn(JSON.stringify({
        event: "stars_payment_unmatched",
        payload: payment.invoice_payload,
        channel,
        ts: nowIso()
      }));
      await telegramApi(env, channel, "sendMessage", {
        chat_id: message.chat.id,
        text: "Fenrir received a payment signal that did not match an active order. Access was not changed. Run /subscribe again if you need a fresh invoice."
      });
      return json({ ok: true });
    }
    await markPaid(env, payment, message, order);
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: `Fenrir Protocol activated.\n\nAccess: active\nStars: ${payment.total_amount}\nPayment rail: Telegram Stars`
    });
    return json({ ok: true });
  }

  const text = normalizeText(message?.text);
  if (!text) return json({ ok: true });

  const isGroup = message.chat?.type === "group" || message.chat?.type === "supergroup";
  const username = botUsername(env);
  const mentionsBot = username && text.toLowerCase().includes(`@${username.toLowerCase()}`);
  const isCommand = text.startsWith("/");

  if (isGroup && !mentionsBot && !isCommand) {
    return json({ ok: true });
  }

  const entitlement = await getEntitlement(env, message.from?.id || message.chat.id);
  const chatId = message.chat.id;

  const openInvoice = async () => {
    await sendText(env, channel, chatId, paymentScreen(text));
    await sendStarsInvoice(env, channel, message);
    return json({ ok: true });
  };

  // 1) SLASH COMMANDS — fully deterministic. A command ALWAYS opens its own screen,
  //    never the LLM and never the fallback menu. This is what makes the MOD commands
  //    behave like real commands instead of collapsing to the menu.
  const parsed = parseCommand(text);
  if (parsed) {
    const { cmd, arg } = parsed;

    if (cmd === "start") {
      // /start with a payload routes by payload; bare /start shows the menu.
      if (/^fenrir_stars\b/i.test(arg)) return openInvoice();
      const startLink = arg.match(/^link_([a-z0-9_-]{8,64})$/i);
      if (startLink) {
        const result = await consumeTelegramLinkCode(env, startLink[1], message);
        await sendText(
          env,
          channel,
          chatId,
          result.ok
            ? "Telegram identity linked to your Frisky ID. Fenrir can now connect this Telegram account to your workspace."
            : "This Fenrir link code is expired or invalid. Open MyFenrir and generate a fresh Telegram link."
        );
        return json({ ok: true });
      }
      await sendBotMenu(env, channel, message, entitlement);
      return json({ ok: true });
    }

    if (cmd === "menu" || cmd === "help") {
      await sendBotMenu(env, channel, message, entitlement);
      return json({ ok: true });
    }
    if (cmd === "setup") {
      await sendText(env, channel, chatId, setupScreen(text));
      return json({ ok: true });
    }
    if (cmd === "plans" || cmd === "pricing") {
      await sendText(env, channel, chatId, plansScreen(text));
      return json({ ok: true });
    }
    if (cmd === "status") {
      await sendText(env, channel, chatId, statusScreen(entitlement, text));
      return json({ ok: true });
    }
    if (cmd === "subscribe" || cmd === "unlock" || cmd === "pay" || cmd === "buy") {
      return openInvoice();
    }
    // Unknown slash command falls through to the intent router below.
  }

  // Late link-code path for any non-/start carrier of a raw link code.
  const linkCode = linkCodeFromStart(text);
  if (linkCode) {
    const result = await consumeTelegramLinkCode(env, linkCode, message);
    await sendText(
      env,
      channel,
      chatId,
      result.ok
        ? "Telegram identity linked to your Frisky ID. Fenrir can now connect this Telegram account to your workspace."
        : "This Fenrir link code is expired or invalid. Open MyFenrir and generate a fresh Telegram link."
    );
    return json({ ok: true });
  }

  // 2) NATURAL-LANGUAGE INTENTS — also deterministic screens, so a plain question like
  //    "how do I set up the bridge target?" opens MOD 01 instead of the menu or the LLM.
  if (menuIntent(text)) {
    await sendBotMenu(env, channel, message, entitlement);
    return json({ ok: true });
  }
  if (paymentIntent(text)) return openInvoice();
  if (setupIntent(text)) {
    await sendText(env, channel, chatId, setupScreen(text));
    return json({ ok: true });
  }
  if (pricingIntent(text)) {
    await sendText(env, channel, chatId, plansScreen(text));
    return json({ ok: true });
  }
  if (statusIntent(text)) {
    await sendText(env, channel, chatId, statusScreen(entitlement, text));
    return json({ ok: true });
  }

  // 3) FREE-FORM — only genuinely open-ended chat reaches the LLM (or the menu fallback).
  const answer = await geminiMind(env, { text, channel }, entitlement);
  await sendText(env, channel, chatId, answer);
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/telegram/webhook" && request.method === "POST") {
      return handleTelegramWebhook(request, env, url);
    }

    if (url.pathname === "/api/telegram/stars" && request.method === "GET") {
      const username = botUsername(env);
      if (!username || !botToken(env, "prod")) {
        return json({ ok: false, error: "telegram_stars_not_configured" }, { status: 500 });
      }
      return json({
        ok: true,
        botUsername: username,
        url: `https://t.me/${username}?start=fenrir_stars`,
        stars: starsPrice(env),
        mode: "telegram_stars"
      });
    }

    if (url.pathname === "/api/readiness" && request.method === "GET") {
      return json({
        ok: true,
        service: "fenrir-stars-payments",
        billing: {
          telegramStarsConfigured: Boolean(botUsername(env) && botToken(env, "prod")),
          telegramWebhookSecretConfigured: Boolean(normalizeText(env.TELEGRAM_WEBHOOK_SECRET))
        },
        mind: {
          geminiConfigured: Boolean(normalizeText(env.GEMINI_API_KEY || env.GOOGLE_AI_STUDIO_API_KEY)),
          model: normalizeText(env.GEMINI_MODEL) || "gemini-3-flash-preview",
          fallbackEnabled: true
        },
        gate: {
          enabled: gateEnabled(env),
          turnstileConfigured: Boolean(normalizeText(env.TURNSTILE_SITE_KEY)),
          miniAppUrl: gateMiniAppUrl(env)
        }
      });
    }

    // --- Fenrir Gate routes ---------------------------------------------------

    // Serve the Mini App HTML
    if (url.pathname === "/gate/app" && request.method === "GET") {
      if (!gateEnabled(env)) {
        return json({ ok: false, error: "gate_not_configured" }, { status: 503 });
      }
      return serveGateMiniApp(env, url);
    }

    // Gate approve callback (Mini App POSTs here after Turnstile pass)
    if (url.pathname === "/api/telegram/gate-approve" && request.method === "POST") {
      if (!gateEnabled(env)) {
        return json({ ok: false, error: "gate_not_configured" }, { status: 503 });
      }
      return handleGateApprove(request, env);
    }

    // Gate status — check if a group has gate enabled
    if (url.pathname === "/api/telegram/gate-status" && request.method === "GET") {
      const chatId = url.searchParams.get("chat");
      if (!chatId) return json({ ok: false, error: "missing_chat" }, { status: 400 });
      const groupConfig = await getGateGroup(env, chatId);
      return json({
        ok: true,
        gate_enabled: gateEnabled(env),
        group: groupConfig ? {
          chat_id: groupConfig.chat_id,
          group_name: groupConfig.group_name,
          accent_color: groupConfig.accent_color,
          has_logo: Boolean(groupConfig.logo_url),
        } : null
      });
    }

    // -----------------------------------------------------------------

    return json({ ok: true, service: "fenrir-stars-payments" });
  }
};
