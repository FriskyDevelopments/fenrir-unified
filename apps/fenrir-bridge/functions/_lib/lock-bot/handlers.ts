/**
 * Fenrir Lock Bot — Routing gate + keyboard builders + conversation handlers.
 *
 * Architecture (mirrors the existing MyFenrir bot pattern):
 *   - `tg(env, method, body)` for all Bot API calls
 *   - Session stored per-chat in a Map (ephemeral; within-isolate cache)
 *   - Lock persistence via D1 (production) or in-memory (fallback)
 *   - Callback data prefixed to stay under Telegram's 64-byte limit
 */

import type { Locale } from "./locales.js";
import { t } from "./locales.js";
import { verifyDns, expectedToken, challengeRecord } from "./dns.js";
import {
    createLock,
    getLock,
    rotateLock,
    revokeLock,
    listActiveLocks,
    type InviteLock,
} from "./store.js";

// ── Telegram API helper (mirrors _lib/telegram-stars.ts) ──
async function tg(
    env: Record<string, string | undefined>,
    method: string,
    body: Record<string, unknown>,
): Promise<unknown> {
    const token = env.LOCK_BOT_TOKEN?.trim() || env.FENRIR_LOCK_BOT_TOKEN?.trim();
    if (!token) throw new Error("missing_env:LOCK_BOT_TOKEN");
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok || !(data as Record<string, unknown>)?.ok) {
        throw new Error(`telegram_api_failed:${method}`);
    }
    return data;
}

// ── Types ─────────────────────────────────────────────────
type FlowState =
    | "start"
    | "create-input"
    | "verifying"
    | "creating"
    | "lock-ready"
    | "rotating"
    | "rotated"
    | "revoked"
    | "my-locks";

interface Session {
    locale: Locale;
    flow: FlowState;
    pendingDomain?: string;
    lastLockId?: string;
}

// Per-chat sessions (in-memory; survives within-isolate)
const sessions = new Map<number, Session>();

function getSession(chatId: number): Session {
    let s = sessions.get(chatId);
    if (!s) {
        s = { locale: "en", flow: "start" };
        sessions.set(chatId, s);
    }
    return s;
}

// ── HTML-safe escape ──────────────────────────────────────
function esc(s: string): string {
    return s.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
}

// ── Inline keyboard builders ──────────────────────────────
// Callback data prefixes (compact for < 64 bytes)
const P = {
    C: "c",
    ML: "aml",
    B: "ab",
    CP: "lcp:",
    RT: "lrt:",
    RV: "lrv:",
    CR: "acr",
    CC: "acc",
    LC: "alc:",
};

function row(
    ...btns: { text: string; data: string }[]
): { text: string; data: string }[] {
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
    return {
        inline_keyboard: [row({ text: `⏳ ${label}`, data: "anoop" })],
    };
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
            row(
                { text: "🇬🇧 EN", data: P.LC + "en" },
                { text: "🇪🇸 ES", data: P.LC + "es" },
            ),
            row(
                { text: "🇫🇷 FR", data: P.LC + "fr" },
                { text: "🇩🇪 DE", data: P.LC + "de" },
            ),
        ],
    };
}

// ── Message builders ──────────────────────────────────────
function welcomeMsg(locale: Locale): string {
    return [
        `<b>🔐 ${t(locale, "welcome_title")}</b> <code>${t(locale, "welcome_badge")}</code>`,
        "",
        t(locale, "welcome_text"),
        "",
        `🤫 ${t(locale, "welcome_silent")}`,
    ].join("\n");
}

function lockReadyMsg(locale: Locale, lockId: string, domain: string): string {
    return [
        `<b>🔐 ${t(locale, "lock_ready_title")}</b>`,
        "",
        `<code>${esc(lockId)}</code>`,
        "",
        t(locale, "lock_ready_line").replace("example.com", esc(domain)),
    ].join("\n");
}

function rotatedMsg(locale: Locale, lockId: string, domain: string): string {
    return [
        `<b>✓ ${t(locale, "rotated_title")}</b>`,
        "",
        `<code>${esc(lockId)}</code>`,
        "",
        `${t(locale, "rotated_line")} (${esc(domain)})`,
    ].join("\n");
}

function revokedMsg(locale: Locale, domain: string): string {
    return [
        `<b>🔴 ${t(locale, "revoked_title")}</b>`,
        "",
        t(locale, "revoked_line").replace("example.com", esc(domain)),
    ].join("\n");
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
    const cleaned = input
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "");
    return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(
        cleaned,
    )
        ? cleaned
        : null;
}

/** Lightweight sleep for simulated delays (only in non-rotate paths) */
function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

// ── Callback data parsers ─────────────────────────────────
function parseCallbackData(
    data: string,
): { type: string; payload?: string } {
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

// ── Callback helpers ──────────────────────────────────────
function editHelper(
    env: Record<string, string | undefined>,
    chatId: number,
    messageId: number | undefined,
) {
    return (text: string, kb?: unknown) =>
        tg(env, "editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            text,
            reply_markup: kb,
        });
}

function answerHelper(
    env: Record<string, string | undefined>,
    cbId: string,
) {
    return (text?: string) =>
        tg(env, "answerCallbackQuery", {
            callback_query_id: cbId,
            text,
            show_alert: false,
        });
}

// ── Main handler ──────────────────────────────────────────

/**
 * Handle an incoming Telegram update for the Lock Bot.
 *
 * @returns Response to return to Telegram (always { ok: true })
 */
export async function handleUpdate(
    env: Record<string, string | undefined>,
    update: Record<string, unknown>,
): Promise<Response> {
    try {
        return await handleUpdateInner(env, update);
    } catch (err) {
        console.error("[lock-bot] Unhandled error:", err);
        // Return 200 to Telegram with empty ok — prevents retry storm.
        // Server-side console.error is the source of truth.
        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }
}

async function handleUpdateInner(
    env: Record<string, string | undefined>,
    update: Record<string, unknown>,
): Promise<Response> {
    // ── Pre-checkout query (unused by this bot, but safe) ──
    if (update.pre_checkout_query) {
        return Response.json({ ok: true });
    }

    const msg = update.message as Record<string, unknown> | undefined;
    const cb = update.callback_query as Record<string, unknown> | undefined;

    if (!msg && !cb) {
        return Response.json({ ok: true });
    }

    // ── Message handler ──────────────────────────────────
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
                text: [
                    "<b>🔐 Fenrir Lock</b>",
                    "",
                    "/start — Main menu",
                    "/lang — Switch language",
                    "/help — This message",
                    "",
                    "Powered by Fenrir Protocol",
                ].join("\n"),
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

            await tg(env, "sendMessage", {
                chat_id: chatId,
                parse_mode: "HTML",
                text: `⏳ ${t(s.locale, "verifying")}`,
                reply_markup: disabledKb(t(s.locale, "verifying")),
            });

            // VERIFICACIÓN REAL. Antes aquí había `await sleep(1500)` y acto
            // seguido un mensaje "✅ verificado": no sólo no se comprobaba nada,
            // se le AFIRMABA al usuario que el dominio estaba verificado. Con
            // eso cualquiera acuñaba un candado para un dominio ajeno.
            const verdict = await verifyDns(domain, chatId, env.LOCK_BOT_DNS_SECRET);
            if (!verdict.ok) {
                s.flow = "create-input";
                const record = challengeRecord(domain);
                const detail =
                    verdict.reason === "not_configured"
                        ? "Domain verification is not configured on the server (LOCK_BOT_DNS_SECRET). No lock was created."
                        : verdict.reason === "lookup_failed"
                          ? "Could not reach DNS to check the record. This is not a rejection — please try again."
                          : `No matching TXT record found at <code>${esc(record)}</code>.`;
                const token =
                    verdict.reason === "not_configured"
                        ? null
                        : await expectedToken(domain, chatId, env.LOCK_BOT_DNS_SECRET ?? "");
                await tg(env, "sendMessage", {
                    chat_id: chatId,
                    parse_mode: "HTML",
                    text:
                        `⚠️ <b>${esc(domain)}</b> — not verified.\n\n${detail}` +
                        (token
                            ? `\n\nAdd this TXT record, then send the domain again:\n<code>${esc(record)}</code>\n<code>${esc(token)}</code>`
                            : ""),
                    reply_markup: backKb(s.locale),
                });
                return Response.json({ ok: true });
            }

            await tg(env, "sendMessage", {
                chat_id: chatId,
                parse_mode: "HTML",
                text: `✅ ${t(s.locale, "verified")}`,
                reply_markup: disabledKb(t(s.locale, "creating")),
            });

            s.flow = "creating";

            // Create lock (persists to D1 or in-memory)
            const lock = await createLock(domain, chatId, env);
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

        // Fallback
        await tg(env, "sendMessage", {
            chat_id: chatId,
            text: t(s.locale, "error_generic"),
            reply_markup: startKb(s.locale),
        });
        return Response.json({ ok: true });
    }

    // ── Callback query handler ───────────────────────────
    if (cb) {
        const data = cb.data as string | undefined;
        const msg2 = cb.message as Record<string, unknown> | undefined;
        const chat2 = msg2?.chat as Record<string, unknown> | undefined;
        const chatId = chat2?.id as number | undefined;
        const cbId = cb.id as string;

        if (!data || !chatId) {
            if (cbId) await tg(env, "answerCallbackQuery", { callback_query_id: cbId });
            return Response.json({ ok: true });
        }

        const s = getSession(chatId);
        const parsed = parseCallbackData(data);
        const mid = msg2?.message_id as number | undefined;
        const edit = editHelper(env, chatId, mid);
        const answer = answerHelper(env, cbId);

        switch (parsed.type) {
            // ── Create ─────────────────────────────────────
            case "create": {
                s.flow = "create-input";
                await edit(t(s.locale, "create_prompt"), backKb(s.locale));
                await answer();
                return Response.json({ ok: true });
            }

            // ── My Locks ───────────────────────────────────
            case "my-locks": {
                const active = await listActiveLocks(chatId, env);
                await edit(myLocksMsg(s.locale, active), backKb(s.locale));
                await answer();
                return Response.json({ ok: true });
            }

            // ── Back ───────────────────────────────────────
            case "back": {
                s.flow = "start";
                await edit(welcomeMsg(s.locale), startKb(s.locale));
                await answer();
                return Response.json({ ok: true });
            }

            // ── Copy ───────────────────────────────────────
            case "copy": {
                const lock = parsed.payload
                    ? await getLock(parsed.payload, env)
                    : undefined;
                // Acotado por dueno: getLock busca solo por id, asi que sin
                // esta comprobacion cualquiera con un id ajeno se llevaba el
                // codigo del candado de otro. Se responde igual que si no
                // existiera: no se confirma que el id sea valido.
                if (lock && !lock.revoked && lock.chatId === chatId) {
                    // Send the code as a new message (Telegram has no clipboard API)
                    await tg(env, "sendMessage", {
                        chat_id: chatId,
                        parse_mode: "HTML",
                        text: `<code>${esc(lock.id)}</code>`,
                    });
                    await answer("Code sent below 👇");
                } else {
                    await answer(t(s.locale, "lock_not_found"));
                }
                return Response.json({ ok: true });
            }

            // ── Rotate ─────────────────────────────────────
            case "rotate": {
                const rotId = parsed.payload;
                if (!rotId) {
                    await answer();
                    return Response.json({ ok: true });
                }

                // Answer immediately to dismiss the button loading state
                // Then do the work and edit the message
                await answer("Rotating…");

                // Fire the rotate and subsequent edit asynchronously
                // (response already returned to Telegram)
                const result = await rotateLock(rotId, chatId, env);
                if (result) {
                    s.flow = "rotated";
                    s.lastLockId = result.fresh.id;
                    await edit(
                        rotatedMsg(s.locale, result.fresh.id, result.fresh.domain),
                        rotatedActionsKb(s.locale, result.fresh.id),
                    );
                } else {
                    await edit(t(s.locale, "lock_not_found"), backKb(s.locale));
                }

                return Response.json({ ok: true });
            }

            // ── Revoke (show confirmation) ─────────────────
            case "revoke": {
                const revId = parsed.payload;
                if (!revId) {
                    await answer();
                    return Response.json({ ok: true });
                }
                s.pendingDomain = revId;
                await edit(t(s.locale, "revoke_confirm"), revokeConfirmKb(s.locale));
                await answer();
                return Response.json({ ok: true });
            }

            // ── Confirm revoke ─────────────────────────────
            case "confirm-revoke": {
                const lockId = s.pendingDomain;
                if (lockId) {
                    const revoked = await revokeLock(lockId, chatId, env);
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

            // ── Cancel revoke ──────────────────────────────
            case "cancel-revoke": {
                s.flow = "lock-ready";
                const active = await listActiveLocks(chatId, env);
                if (active.length > 0) {
                    const latest = active[active.length - 1];
                    await edit(
                        lockReadyMsg(s.locale, latest.id, latest.domain),
                        lockActionsKb(s.locale, latest.id),
                    );
                } else {
                    await edit(welcomeMsg(s.locale), startKb(s.locale));
                }
                await answer();
                return Response.json({ ok: true });
            }

            // ── Locale switch ──────────────────────────────
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

            // ── Unknown / noop ─────────────────────────────
            default: {
                await answer();
                return Response.json({ ok: true });
            }
        }
    }

    return Response.json({ ok: true });
}
