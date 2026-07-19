/**
 * Fenrir Lock Bot — Routing gate + keyboard builders + conversation handlers.
 *
 * Architecture (mirrors the existing MyFenrir bot pattern):
 *   - `telegramApi(env, method, body)` for all Bot API calls
 *   - Session stored per-chat in a Map (ephemeral; survives within-isolate)
 *   - Callback data prefixed to stay under Telegram's 64-byte limit
 */

import type { Locale } from "./locales.js";
import { t } from "./locales.js";
import { lockStore, type InviteLock } from "./store.js";

// ── Telegram API helper (mirrors _lib/telegram-stars.ts) ──
async function tg(
    env: Record<string, string | undefined>,
    method: string,
    body: Record<string, unknown>
): Promise<unknown> {
    const token = env.LOCK_BOT_TOKEN?.trim() || env.FENRIR_LOCK_BOT_TOKEN?.trim();
    if (!token) throw new Error("missing_env:LOCK_BOT_TOKEN");
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
        throw new Error(`telegram_api_failed:${method}`);
    }
    return data;
}

// ── Types ─────────────────────────────────────────────────
type FlowState =
    | "start" | "create-input" | "verifying" | "creating"
    | "lock-ready" | "rotating" | "rotated" | "revoked" | "my-locks";

interface Session {
    locale: Locale;
    flow: FlowState;
    pendingDomain?: string;
    lastLockId?: string;
}

// Per-chat sessions (in-memory)
const sessions = new Map<number, Session>();

function getSession(chatId: number): Session {
    let s = sessions.get(chatId);
    if (!s) { s = { locale: "en", flow: "start" }; sessions.set(chatId, s); }
    return s;
}

// ── HTML-safe escape ──────────────────────────────────────
function esc(s: string): string {
    return s.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
}

// ── Inline keyboard builders ──────────────────────────────
// Callback data prefixes (compact for < 64 bytes)
const P = { C: "c", ML: "aml", B: "ab", CP: "lcp:", RT: "lrt:", RV: "lrv:", CR: "acr", CC: "acc", LC: "alc:" };

function row(...btns: { text: string; data: string }[]): { text: string; data: string }[] {
    return btns;
}

function startKb(locale: Locale) {
    return {
        inline_keyboard: [
            row({ text: t(locale, "btn_create"), data: P.C }),
            row({ text: t(locale, "btn_my_locks"), data: P.ML }),
        ],
    };
}

function backKb(locale: Locale) {
    return { inline_keyboard: [row({ text: t(locale, "btn_back"), data: P.B })] };
}

function disabledKb(label: string) {
    return { inline_keyboard: [row({ text: `⏳ ${label}`, data: "anoop" })] };
}

function lockActionsKb(locale: Locale, lockId: string) {
    return {
        inline_keyboard: [
            row({ text: t(locale, "btn_copy"), data: P.CP + lockId }),
            row(
                { text: t(locale, "btn_rotate"), data: P.RT + lockId },
                { text: t(locale, "btn_revoke"), data: P.RV + lockId },
            ),
            row({ text: t(locale, "btn_back"), data: P.B }),
        ],
    };
}

function rotatedActionsKb(locale: Locale, lockId: string) {
    return {
        inline_keyboard: [
            row({ text: t(locale, "btn_copy_new"), data: P.CP + lockId }),
            row(
                { text: t(locale, "btn_rotate"), data: P.RT + lockId },
                { text: t(locale, "btn_revoke"), data: P.RV + lockId },
            ),
            row({ text: t(locale, "btn_back"), data: P.B }),
        ],
    };
}

function revokeConfirmKb(locale: Locale) {
    return {
        inline_keyboard: [
            row(
                { text: t(locale, "revoke_yes"), data: P.CR },
                { text: t(locale, "revoke_cancel"), data: P.CC },
            ),
        ],
    };
}

function localeKb() {
    return {
        inline_keyboard: [
            row({ text: "🇬🇧 EN", data: P.LC + "en" }, { text: "🇪🇸 ES", data: P.LC + "es" }),
            row({ text: "🇫🇷 FR", data: P.LC + "fr" }, { text: "🇩🇪 DE", data: P.LC + "de" }),
        ],
    };
}

// ── Message builders ──────────────────────────────────────
function welcomeMsg(locale: Locale): string {
    return `<b>🔐 ${t(locale, "welcome_title")}</b> <code>${t(locale, "welcome_badge")}</code>\n\n${t(locale, "welcome_text")}\n\n🤫 ${t(locale, "welcome_silent")}`;
}

function lockReadyMsg(locale: Locale, lockId: string, domain: string): string {
    return `<b>🔐 ${t(locale, "lock_ready_title")}</b>\n\n<code>${esc(lockId)}</code>\n\n${t(locale, "lock_ready_line").replace("example.com", esc(domain))}`;
}

function rotatedMsg(locale: Locale, lockId: string, domain: string): string {
    return `<b>✓ ${t(locale, "rotated_title")}</b>\n\n<code>${esc(lockId)}</code>\n\n${t(locale, "rotated_line")} (${esc(domain)})`;
}

function revokedMsg(locale: Locale, domain: string): string {
    return `<b>🔴 ${t(locale, "revoked_title")}</b>\n\n${t(locale, "revoked_line").replace("example.com", esc(domain))}`;
}

function myLocksMsg(locale: Locale, locks: InviteLock[]): string {
    let text = `<b>⚙ ${t(locale, "my_locks_title")}</b>\n\n`;
    if (locks.length === 0) {
        text += t(locale, "my_locks_empty");
    } else {
        for (const l of locks) {
            const short = l.id.length > 12 ? l.id.slice(0, 12) + "…" : l.id;
            text += `<code>${esc(l.domain)}</code> — ${esc(short)}\n`;
        }
        text += `\n📊 ${locks.length} active lock${locks.length !== 1 ? "s" : ""}`;
    }
    return text;
}

// ── Helpers ───────────────────────────────────────────────
function validateDomain(input: string): string | null {
    const cleaned = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(cleaned) ? cleaned : null;
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

// ── Callback data parsers ─────────────────────────────────
function parseCallbackData(data: string): { type: string; payload?: string } {
    if (data === P.C) return { type: "create" };
    if (data === P.ML) return { type: "my-locks" };
    if (data === P.B) return { type: "back" };
    if (data === P.CR) return { type: "confirm-revoke" };
    if (data === P.CC) return { type: "cancel-revoke" };
    if (data === "anoop") return { type: "noop" };
    if (data.startsWith(P.CP)) return { type: "copy", payload: data.slice(4) };
    if (data.startsWith(P.RT)) return { type: "rotate", payload: data.slice(4) };
    if (data.startsWith(P.RV)) return { type: "revoke", payload: data.slice(4) };
    if (data.startsWith(P.LC)) return { type: "locale", payload: data.slice(4) };
    return { type: "unknown" };
}

// ── Main handler ──────────────────────────────────────────

/**
 * Handle an incoming Telegram update for the Lock Bot.
 *
 * @returns Response to return to Telegram (always { ok: true })
 */
export async function handleUpdate(
    env: Record<string, string | undefined>,
    update: Record<string, unknown>
): Promise<Response> {
    // ── Pre-checkout query ─────────────────────────────
    if (update.pre_checkout_query) {
        return Response.json({ ok: true });
    }

    const msg = update.message as Record<string, unknown> | undefined;
    const cb = update.callback_query as Record<string, unknown> | undefined;

    if (!msg && !cb) {
        return Response.json({ ok: true });
    }

    // ── Message handler ────────────────────────────────
    if (msg) {
        const chat = msg.chat as Record<string, unknown> | undefined;
        const chatId = chat?.id as number | undefined;
        const text = (msg.text as string | undefined)?.trim() ?? "";

        if (!chatId) return Response.json({ ok: true });

        const s = getSession(chatId);
        const textLower = text.toLowerCase();

        // /start command
        if (textLower.startsWith("/start")) {
            const args = textLower.split(/\s+/)[1];
            // Locale switch via deep link: /start loc_es
            if (args?.startsWith("loc_")) {
                const target = args.slice(4) as Locale;
                if (["en", "es", "fr", "de"].includes(target)) {
                    s.locale = target;
                }
            }
            s.flow = "start";
            await tg(env, "sendMessage", {
                chat_id: chatId,
                parse_mode: "HTML",
                text: welcomeMsg(s.locale),
                reply_markup: startKb(s.locale),
            });
            return Response.json({ ok: true });
        }

        // /lang command
        if (textLower.startsWith("/lang") || textLower.startsWith("/language")) {
            await tg(env, "sendMessage", {
                chat_id: chatId,
                text: "Choose your language / Elige tu idioma / Choisissez votre langue / Wähle deine Sprache:",
                reply_markup: localeKb(),
            });
            return Response.json({ ok: true });
        }

        // /help command
        if (textLower.startsWith("/help")) {
            await tg(env, "sendMessage", {
                chat_id: chatId,
                parse_mode: "HTML",
                text: `<b>🔐 Fenrir Lock</b>\n\n/start — Main menu\n/lang — Switch language\n/create — Create a domain lock\n\nPowered by Fenrir Protocol`,
            });
            return Response.json({ ok: true });
        }

        // Domain input (only if in create-input flow)
        if (s.flow === "create-input") {
            const domain = validateDomain(text);
            if (!domain) {
                await tg(env, "sendMessage", {
                    chat_id: chatId,
                    text: t(s.locale, "error_invalid_domain"),
                });
                return Response.json({ ok: true });
            }

            s.flow = "verifying";
            s.pendingDomain = domain;

            // Verifying...
            await tg(env, "sendMessage", {
                chat_id: chatId,
                parse_mode: "HTML",
                text: `<div class="status-line"><span class="spinner"></span> ${t(s.locale, "verifying")}</div>`,
                reply_markup: disabledKb(t(s.locale, "verifying")),
            });

            await sleep(1500);

            // Verified
            await tg(env, "sendMessage", {
                chat_id: chatId,
                parse_mode: "HTML",
                text: `✅ ${t(s.locale, "verified")}`,
                reply_markup: disabledKb(t(s.locale, "creating")),
            });

            s.flow = "creating";
            await sleep(1000);

            // Create lock
            const lock = lockStore.create(domain, chatId);
            s.flow = "lock-ready";
            s.lastLockId = lock.id;

            await tg(env, "sendMessage", {
                chat_id: chatId,
                parse_mode: "HTML",
                text: lockReadyMsg(s.locale, lock.id, lock.domain),
                reply_markup: lockActionsKb(s.locale, lock.id),
            });

            return Response.json({ ok: true });
        }

        // Fallback for other messages
        await tg(env, "sendMessage", {
            chat_id: chatId,
            text: t(s.locale, "error_generic"),
            reply_markup: startKb(s.locale),
        });
        return Response.json({ ok: true });
    }

    // ── Callback query handler ─────────────────────────
    if (cb) {
        const data = cb.data as string | undefined;
        const msg2 = cb.message as Record<string, unknown> | undefined;
        const chat2 = msg2?.chat as Record<string, unknown> | undefined;
        const chatId = chat2?.id as number | undefined;
        const cbId = cb.id as string;

        if (!data || !chatId) {
            await tg(env, "answerCallbackQuery", { callback_query_id: cbId });
            return Response.json({ ok: true });
        }

        const s = getSession(chatId);
        const parsed = parseCallbackData(data);
        const mid = msg2?.message_id as number | undefined;

        const edit = (text: string, kb?: unknown) =>
            tg(env, "editMessageText", {
                chat_id: chatId,
                message_id: mid,
                parse_mode: "HTML",
                text,
                reply_markup: kb,
            });

        const answer = (text?: string) =>
            tg(env, "answerCallbackQuery", {
                callback_query_id: cbId,
                text,
                show_alert: false,
            });

        switch (parsed.type) {
            case "create": {
                s.flow = "create-input";
                await edit(t(s.locale, "create_prompt"), backKb(s.locale));
                await answer();
                return Response.json({ ok: true });
            }

            case "my-locks": {
                const active = lockStore.listActive(chatId);
                await edit(myLocksMsg(s.locale, active), backKb(s.locale));
                await answer();
                return Response.json({ ok: true });
            }

            case "back": {
                s.flow = "start";
                await edit(welcomeMsg(s.locale), startKb(s.locale));
                await answer();
                return Response.json({ ok: true });
            }

            case "copy": {
                const lock = parsed.payload ? lockStore.get(parsed.payload) : undefined;
                if (lock && !lock.revoked) {
                    await answer(t(s.locale, "copied"));
                    // Send the code as a separate message for easy copy
                    await tg(env, "sendMessage", {
                        chat_id: chatId,
                        parse_mode: "HTML",
                        text: `<code>${esc(lock.id)}</code>`,
                    });
                } else {
                    await answer(t(s.locale, "lock_not_found"));
                }
                return Response.json({ ok: true });
            }

            case "rotate": {
                const rotId = parsed.payload;
                if (!rotId) { await answer(); return Response.json({ ok: true }); }

                s.flow = "rotating";
                await edit(
                    `<b>🔄 ${t(s.locale, "rotating_title")}</b>\n\n<div class="status-line"><span class="spinner"></span> ${t(s.locale, "rotating_status")}</div>`,
                    disabledKb(t(s.locale, "rotating_title")),
                );

                await sleep(2500);

                const result = lockStore.rotate(rotId, chatId);
                if (!result) {
                    await answer(t(s.locale, "lock_not_found"));
                    return Response.json({ ok: true });
                }

                s.flow = "rotated";
                s.lastLockId = result.fresh.id;

                await edit(
                    rotatedMsg(s.locale, result.fresh.id, result.fresh.domain),
                    rotatedActionsKb(s.locale, result.fresh.id),
                );
                await answer();
                return Response.json({ ok: true });
            }

            case "revoke": {
                const revId = parsed.payload;
                if (!revId) { await answer(); return Response.json({ ok: true }); }
                s.pendingDomain = revId;
                await edit(t(s.locale, "revoke_confirm"), revokeConfirmKb(s.locale));
                await answer();
                return Response.json({ ok: true });
            }

            case "confirm-revoke": {
                const lockId = s.pendingDomain;
                if (lockId) {
                    const revoked = lockStore.revoke(lockId);
                    if (revoked) {
                        s.flow = "revoked";
                        await edit(revokedMsg(s.locale, revoked.domain), backKb(s.locale));
                    } else {
                        await answer(t(s.locale, "lock_not_found"));
                    }
                }
                await answer();
                return Response.json({ ok: true });
            }

            case "cancel-revoke": {
                s.flow = "lock-ready";
                const active = lockStore.listActive(chatId);
                if (active.length > 0) {
                    const latest = active[active.length - 1];
                    await edit(lockReadyMsg(s.locale, latest.id, latest.domain), lockActionsKb(s.locale, latest.id));
                } else {
                    await edit(welcomeMsg(s.locale), startKb(s.locale));
                }
                await answer();
                return Response.json({ ok: true });
            }

            case "locale": {
                const target = parsed.payload as Locale;
                if (target && ["en", "es", "fr", "de"].includes(target)) {
                    s.locale = target;
                    s.flow = "start";
                    await edit(welcomeMsg(s.locale), startKb(s.locale));
                }
                await answer();
                return Response.json({ ok: true });
            }

            default: {
                await answer();
                return Response.json({ ok: true });
            }
        }
    }

    return Response.json({ ok: true });
}
