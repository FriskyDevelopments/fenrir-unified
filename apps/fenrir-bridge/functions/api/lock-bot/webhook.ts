import { Bot, webhookCallback } from "grammy";
import { registerHandlers } from "../../_lib/lock-bot/handlers.js";
import { LockStore } from "../../_lib/lock-bot/store.js";

interface Env {
    DB: D1Database;
    TELEGRAM_BOT_TOKEN: string;
}

let botCache: Bot | null = null;
let webhookCache: any = null;

export const onRequestPost: PagesFunction<Env> = async (context) => {
    const { request, env } = context;

    if (!env.TELEGRAM_BOT_TOKEN) {
        return new Response("Missing TELEGRAM_BOT_TOKEN", { status: 500 });
    }

    if (!botCache) {
        botCache = new Bot(env.TELEGRAM_BOT_TOKEN);
        const lockStore = new LockStore(env.DB);
        registerHandlers(botCache, lockStore);

        botCache.catch((err) => {
            console.error(`[lock-bot] Unhandled error:`, err.error);
        });

        webhookCache = webhookCallback(botCache, "cloudflare-mod");
    }

    return webhookCache(request);
};
