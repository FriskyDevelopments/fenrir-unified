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
 * Provision both Pages environments and register Telegram's secret_token
 * before deployment. See docs/LOCK_BOT_ROLLOUT.md for the release sequence.
 *
 * Route: POST /api/lock-bot/webhook
 */

import { handleUpdate } from "../../_lib/lock-bot/handlers.js";

/** Comparación en tiempo constante: comparar secretos con === filtra su
 *  longitud y su prefijo por el tiempo de respuesta. */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
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
    // ── Validate webhook secret — FAIL CLOSED ───────────────
    //
    // Antes esto era `if (configuredSecret) { …401 }`: si la variable no estaba
    // puesta, no se validaba NADA y cualquiera podía postear updates falsos.
    // La configuración de production y preview debe comprobarse antes del
    // despliegue siguiendo docs/LOCK_BOT_ROLLOUT.md.
    //
    // Un secreto ausente es una configuración incompleta, no un permiso. El
    // webhook de @Myfenrir_bot ya lo hace bien devolviendo 500 cuando falta
    // TELEGRAM_WEBHOOK_SECRET; este se comporta igual ahora.
    const configuredSecret = (context.env.LOCK_BOT_WEBHOOK_SECRET ?? "").trim();
    if (!configuredSecret) {
        return Response.json(
            {
                ok: false,
                error: "lock_bot_not_configured",
                detail: "LOCK_BOT_WEBHOOK_SECRET is not set. Refusing to accept unauthenticated updates.",
            },
            { status: 500 },
        );
    }
    const received = context.request.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (!timingSafeEqual(received, configuredSecret)) {
        return Response.json({ ok: false, error: "invalid_webhook_secret" }, { status: 401 });
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
