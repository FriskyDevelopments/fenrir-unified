/**
 * Fenrir Lock Bot — Cloudflare Pages Function webhook
 *
 * This is a SEPARATE bot from the MyFenrir Telegram bot.
 * It manages domain-locked invite codes for Telegram communities.
 *
 * Required env vars:
 *   LOCK_BOT_TOKEN             — Bot token from @BotFather
 *   LOCK_BOT_WEBHOOK_SECRET    — Shared secret for X-Telegram-Bot-Api-Secret-Token
 *
 * Set webhook:
 *   curl -X POST https://api.telegram.org/bot<LOCK_BOT_TOKEN>/setWebhook \
 *     -d "url=https://<your-domain>/api/lock-bot/webhook" \
 *     -d "secret_token=<LOCK_BOT_WEBHOOK_SECRET>" \
 *     -d 'allowed_updates=["message","callback_query"]'
 *
 * Route: POST /api/lock-bot/webhook
 */

import { handleUpdate } from "../../_lib/lock-bot/handlers.js";

function timingSafeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

/**
 * Lock-bot specific env bindings.
 * Extend with D1 or KV bindings as needed.
 */
export interface LockBotEnv {
    LOCK_BOT_TOKEN?: string;
    FENRIR_LOCK_BOT_TOKEN?: string;
    LOCK_BOT_WEBHOOK_SECRET?: string;
    DB?: unknown; // D1Database — typed by Cloudflare at deploy time
}

export const onRequestPost: PagesFunction<LockBotEnv> = async (context) => {
    // ── Validate webhook secret ─────────────────────────────
    const configuredSecret = (context.env.LOCK_BOT_WEBHOOK_SECRET ?? "").trim();
    if (configuredSecret) {
        const received = context.request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (!timingSafeEqual(received, configuredSecret)) {
            return Response.json(
                { ok: false, error: "invalid_webhook_secret" },
                { status: 401 }
            );
        }
    }

    // ── Validate bot token ──────────────────────────────────
    const token = (context.env.LOCK_BOT_TOKEN ?? context.env.FENRIR_LOCK_BOT_TOKEN ?? "").trim();
    if (!token) {
        return Response.json(
            {
                ok: false,
                error: "lock_bot_not_configured",
                detail: "LOCK_BOT_TOKEN is not set. Add it to your Cloudflare Pages env vars.",
            },
            { status: 503 }
        );
    }

    // ── Parse update ────────────────────────────────────────
    const update: unknown = await context.request.json().catch(() => null);
    if (!update || typeof update !== "object") {
        return Response.json({ ok: false, error: "invalid_update" }, { status: 400 });
    }

    // ── Dispatch to handler ─────────────────────────────────
    return handleUpdate(context.env as Record<string, string | undefined>, update as Record<string, unknown>);
};
