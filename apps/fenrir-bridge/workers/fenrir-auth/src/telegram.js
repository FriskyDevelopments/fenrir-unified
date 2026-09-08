// Telegram identity link for @Myfenrir_bot (Community Bridge).
// Not @MyFenrirTeleConnectBot (VC). Does not own gate.myfenrir.com/tg.
import { getSession } from "./identity.js";

export const TELEGRAM_LINK_START_PATH = "/api/telegram/link/start";
export const CANONICAL_BOT = "Myfenrir_bot";
const LINK_TTL_MS = 15 * 60 * 1000;

export function telegramBotUsername(env) {
  const raw = String(
    env?.FENRIR_TELEGRAM_BOT_USERNAME || env?.MYFENRIR_TELEGRAM_BOT_USERNAME || CANONICAL_BOT,
  )
    .replace(/^@/, "")
    .trim();
  return raw || CANONICAL_BOT;
}

export function stableFriskyId(kind, value) {
  const normalized = String(value || "").trim().toLowerCase();
  let hash = 2166136261;
  for (const char of normalized) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const safe = normalized.replace(/[^a-z0-9]+/g, "").toUpperCase();
  return `frisky_${kind}_${safe.slice(0, 18).padEnd(6, "X")}_${(hash >>> 0).toString(36).toUpperCase()}`;
}

export function sessionToLinkIdentity(session) {
  const user = session?.user || {};
  const identityId = String(user.id || "");
  const friskyUserId = identityId.startsWith("frisky_usr_")
    ? identityId
    : stableFriskyId("usr", identityId || user.email || "unknown");
  return {
    email: user.email || "",
    frisky_user_id: friskyUserId,
    frisky_org_id: stableFriskyId("org", friskyUserId),
  };
}

function randomLinkCode() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.slice(0, 24);
}

export async function mintTelegramLinkCode(env, session) {
  const identity = sessionToLinkIdentity(session);
  const code = randomLinkCode();
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + LINK_TTL_MS).toISOString();

  if (env?.DB && typeof env.DB.prepare === "function") {
    await env.DB.prepare(
      `INSERT INTO telegram_account_link_codes (
        code, frisky_user_id, frisky_org_id, email, status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    )
      .bind(code, identity.frisky_user_id, identity.frisky_org_id, identity.email, createdAt, expiresAt)
      .run();
  } else if (env?.SESSIONS && typeof env.SESSIONS.put === "function") {
    await env.SESSIONS.put(
      `telegramlink:${code}`,
      JSON.stringify({
        code,
        frisky_user_id: identity.frisky_user_id,
        frisky_org_id: identity.frisky_org_id,
        email: identity.email,
        status: "pending",
        created_at: createdAt,
        expires_at: expiresAt,
      }),
      { expirationTtl: Math.ceil(LINK_TTL_MS / 1000) },
    );
  } else {
    const err = new Error("link_store_unavailable");
    err.status = 503;
    throw err;
  }

  const username = telegramBotUsername(env);
  return {
    code,
    expiresAt,
    url: `https://t.me/${username}?start=link_${code}`,
  };
}

export function loginRedirectForLinkStart(env) {
  const login = new URL("/login", env?.LOGOUT_REDIRECT || env?.BASE_URL || "https://myfenrir.com");
  login.pathname = "/login";
  login.search = "";
  login.searchParams.set("next", TELEGRAM_LINK_START_PATH);
  return login.toString();
}

export async function handleTelegramLink(request, env, parts) {
  const method = request.method.toUpperCase();
  const leaf = parts[3] || "";

  if (leaf === "start") {
    if (method !== "GET" && method !== "HEAD") {
      return json({ error: "method_not_allowed" }, 405);
    }
    const session = await getSession(env, request);
    if (!session) {
      return redirect(loginRedirectForLinkStart(env));
    }
    try {
      const link = await mintTelegramLinkCode(env, session);
      return redirect(link.url, {
        "Referrer-Policy": "no-referrer",
      });
    } catch (error) {
      if (error?.message === "link_store_unavailable") {
        return json({ ok: false, error: "db_not_configured" }, 503);
      }
      throw error;
    }
  }

  if (leaf !== "") {
    return json({ error: "not_found", path: `/${parts.join("/")}` }, 404);
  }

  if (method === "POST") {
    const session = await getSession(env, request);
    if (!session) {
      return json({ ok: false, error: "authentication_required" }, 401);
    }
    try {
      const link = await mintTelegramLinkCode(env, session);
      return json({
        ok: true,
        linked: false,
        code: link.code,
        expiresAt: link.expiresAt,
        url: link.url,
      });
    } catch (error) {
      if (error?.message === "link_store_unavailable") {
        return json({ ok: false, error: "db_not_configured" }, 503);
      }
      throw error;
    }
  }

  if (method === "GET" || method === "HEAD") {
    const session = await getSession(env, request);
    if (!session) {
      return json({ ok: false, error: "authentication_required" }, 401);
    }
    return json({
      ok: true,
      linked: false,
      bot: telegramBotUsername(env),
    });
  }

  return json({ error: "method_not_allowed" }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function redirect(location, extraHeaders = {}) {
  return new Response(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": "no-store", ...extraHeaders },
  });
}

/** Ops log sink for successful MyFenrir logins (Krystal bot logs). Never include secrets. */
export function authLogChatId(env) {
  const raw = String(env?.FENRIR_AUTH_LOG_CHAT_ID || env?.MYFENRIR_AUTH_LOG_CHAT_ID || "").trim();
  return raw || "";
}

export function telegramBotToken(env) {
  return String(
    env?.TELEGRAM_PROD_BOT_TOKEN ||
      env?.TELEGRAM_BOT_TOKEN ||
      env?.MYFENRIR_BOT_TOKEN ||
      "",
  ).trim();
}

function redactUserLabel(user) {
  const provider = String(user?.provider || "unknown").slice(0, 32);
  const sub = String(user?.sub || user?.id || "");
  const tail = sub.length <= 4 ? "****" : sub.slice(-4);
  return `${provider} · …${tail}`;
}

/**
 * Fire-and-forget Telegram notify after a successful session mint.
 * Skips quietly when chat id or bot token is unset. Never throws into the login path.
 */
export async function notifyLoginEvent(env, user, meta = {}) {
  const chatId = authLogChatId(env);
  const token = telegramBotToken(env);
  if (!chatId || !token) return { ok: false, skipped: true };

  const host = String(meta.host || "myfenrir.com").slice(0, 64);
  const text = [
    "MyFenrir login",
    `host: ${host}`,
    `who: ${redactUserLabel(user)}`,
  ].join("\n");

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error(JSON.stringify({ message: "auth_login_log_failed", status: res.status }));
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (error) {
    console.error(JSON.stringify({
      message: "auth_login_log_failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    return { ok: false };
  }
}
