import { Bot, Context, InlineKeyboard } from "grammy";
import type { Locale, Session } from "./types.js";
import { t, LOCALE_LABELS } from "./locales.js";
import {
    startKeyboard,
    createInputKeyboard,
    verifyingKeyboard,
    creatingKeyboard,
    lockReadyKeyboard,
    rotatingKeyboard,
    rotatedKeyboard,
    revokedKeyboard,
    myLocksKeyboard,
    revokeConfirmKeyboard,
    isCreate,
    isMyLocks,
    isBack,
    isCopy,
    isRotate,
    isRevoke,
    isConfirmRevoke,
    isCancelRevoke,
    isLocaleSwitch,
} from "./keyboards.js";
import { lockStore } from "./store.js";
import { validateDomain, verifyDns } from "./dns.js";

// ── Session key (per chat) ────────────────────────────────
// grammy's built-in session is fine, but we keep it explicit for clarity.
const sessions = new Map<number, Session>();

function getSession(ctx: Context): Session {
    const id = ctx.chat?.id;
    if (!id) return { locale: "en", flow: "start" };
    let s = sessions.get(id);
    if (!s) {
        s = { locale: "en", flow: "start" };
        sessions.set(id, s);
    }
    return s;
}

function setSession(ctx: Context, patch: Partial<Session>): Session {
    const s = getSession(ctx);
    Object.assign(s, patch);
    return s;
}

// ── HTML escape ───────────────────────────────────────────
function esc(text: string): string {
    return text
        .replace(/&/g, "&")
        .replace(/</g, "<")
        .replace(/>/g, ">");
}

// ── Register all handlers ─────────────────────────────────
export function registerHandlers(bot: Bot, lockStore: import("./store.js").LockStore): void {
    // ── /start ─────────────────────────────────────────────
    bot.command("start", async (ctx) => {
        setSession(ctx, { flow: "start" });
        const s = getSession(ctx);
        await ctx.reply(buildWelcome(s.locale), {
            parse_mode: "HTML",
            reply_markup: startKeyboard(s.locale),
        });
    });

    // ── /lang — switch locale ──────────────────────────────
    bot.command("lang", async (ctx) => {
        const s = getSession(ctx);
        const args = ctx.message?.text?.split(/\s+/);
        const target = args?.[1] as Locale | undefined;
        if (target && ["en", "es", "fr", "de"].includes(target)) {
            setSession(ctx, { locale: target });
            await ctx.reply(`Locale switched to ${LOCALE_LABELS[target]}`, {
                reply_markup: startKeyboard(target),
            });
        } else {
            await ctx.reply("Choose your language / Elige tu idioma / Choisissez votre langue / Wähle deine Sprache:", {
                reply_markup: new InlineKeyboard()
                    .text("🇬🇧 English", "loc:en")
                    .text("🇪🇸 Español", "loc:es")
                    .row()
                    .text("🇫🇷 Français", "loc:fr")
                    .text("🇩🇪 Deutsch", "loc:de"),
            });
        }
    });

    // ── Text messages (domain input) ────────────────────────
    bot.on("message:text", async (ctx) => {
        const s = getSession(ctx);

        // Ignore if not in the create-input flow
        if (s.flow !== "create-input") return;

        const domain = validateDomain(ctx.message.text);
        if (!domain) {
            await ctx.reply(t(s.locale, "error_invalid_domain"));
            return;
        }

        // Store the domain & start verifying
        setSession(ctx, { flow: "verifying", pendingDomain: domain });

        // Typing indicator and "Verifying" message
        await ctx.replyWithChatAction("typing");
        await ctx.reply(
            `<pre>${t(s.locale, "verifying")}</pre>`,
            { parse_mode: "HTML", reply_markup: verifyingKeyboard(s.locale) }
        );

        // Simulate DNS verification
        const verified = await verifyDns(domain);

        if (!verified) {
            // DNS verification failed — send back to input
            setSession(ctx, { flow: "create-input" });
            await ctx.reply("❌ DNS verification failed. Make sure the domain has the required TXT record.", {
                reply_markup: createInputKeyboard(s.locale),
            });
            return;
        }

        // DNS verified
        await ctx.reply(`✅ ${t(s.locale, "verified")}`, {
            parse_mode: "HTML",
            reply_markup: creatingKeyboard(s.locale),
        });

        // Create the lock
        setSession(ctx, { flow: "creating" });
        await ctx.replyWithChatAction("typing");

        // Small delay to simulate generation
        await new Promise((r) => setTimeout(r, 1000));

        const lock = await lockStore.create(domain, ctx.chat!.id);

        // Send the GIF animation
        await ctx.replyWithAnimation("https://bridge.myfenrir.com/fenrir_reveal.gif", {
            caption: `✅ ${t(s.locale, "created")}`
        });

        // Lock ready
        setSession(ctx, { flow: "lock-ready" });
        await ctx.reply(buildLockReady(s.locale, lock.id, domain), {
            parse_mode: "HTML",
            reply_markup: lockReadyKeyboard(s.locale, lock.id),
        });
    });

    // ── Callback queries ────────────────────────────────────
    bot.on("callback_query:data", async (ctx) => {
        const data = ctx.callbackQuery.data;
        const s = getSession(ctx);

        // ── Locale switch ─────────────────────────────────
        const locTarget = isLocaleSwitch(data);
        if (locTarget && ["en", "es", "fr", "de"].includes(locTarget)) {
            setSession(ctx, { locale: locTarget as Locale, flow: "start" });
            await ctx.editMessageText(buildWelcome(locTarget as Locale), {
                parse_mode: "HTML",
                reply_markup: startKeyboard(locTarget as Locale),
            });
            await ctx.answerCallbackQuery();
            return;
        }

        // ── Create lock ───────────────────────────────────
        if (isCreate(data)) {
            setSession(ctx, { flow: "create-input" });
            await ctx.editMessageText(t(s.locale, "create_prompt"), {
                reply_markup: createInputKeyboard(s.locale),
            });
            await ctx.answerCallbackQuery();
            return;
        }

        // ── My Locks ──────────────────────────────────────
        if (isMyLocks(data)) {
            const active = await lockStore.listActive(ctx.chat!.id);
            const text = buildMyLocks(s.locale, active);
            await ctx.editMessageText(text, {
                parse_mode: "HTML",
                reply_markup: myLocksKeyboard(s.locale),
            });
            await ctx.answerCallbackQuery();
            return;
        }

        // ── Back ──────────────────────────────────────────
        if (isBack(data)) {
            setSession(ctx, { flow: "start" });
            await ctx.editMessageText(buildWelcome(s.locale), {
                parse_mode: "HTML",
                reply_markup: startKeyboard(s.locale),
            });
            await ctx.answerCallbackQuery();
            return;
        }

        // ── Copy ──────────────────────────────────────────
        const copyId = isCopy(data);
        if (copyId) {
            const lock = await lockStore.get(copyId);
            if (lock && !lock.revoked) {
                await ctx.answerCallbackQuery({
                    text: t(s.locale, "copied"),
                    show_alert: false,
                });
                // Send the invite code as a separate message for easy copying
                await ctx.reply(`<code>${esc(lock.id)}</code>`, {
                    parse_mode: "HTML",
                });
            } else {
                await ctx.answerCallbackQuery({ text: t(s.locale, "lock_not_found") });
            }
            return;
        }

        // ── Rotate ────────────────────────────────────────
        const rotId = isRotate(data);
        if (rotId) {
            setSession(ctx, { flow: "rotating" });

            // Show rotating animation
            await ctx.editMessageText(
                `<pre>${t(s.locale, "rotating_title")}</pre>`,
                { parse_mode: "HTML", reply_markup: rotatingKeyboard(s.locale) }
            );

            await ctx.replyWithChatAction("typing");
            await new Promise((r) => setTimeout(r, 2500));

            const result = await lockStore.rotate(rotId, ctx.chat!.id);
            if (!result) {
                await ctx.answerCallbackQuery({ text: t(s.locale, "lock_not_found") });
                return;
            }

            setSession(ctx, { flow: "rotated" });
            await ctx.editMessageText(buildRotated(s.locale, result.fresh.id, result.fresh.domain), {
                parse_mode: "HTML",
                reply_markup: rotatedKeyboard(s.locale, result.fresh.id),
            });
            await ctx.answerCallbackQuery();
            return;
        }

        // ── Revoke (show confirmation) ────────────────────
        const revId = isRevoke(data);
        if (revId) {
            // Store the lock id being considered for revoke
            setSession(ctx, { pendingDomain: revId });
            await ctx.editMessageText(t(s.locale, "revoke_confirm"), {
                reply_markup: revokeConfirmKeyboard(s.locale),
            });
            await ctx.answerCallbackQuery();
            return;
        }

        // ── Confirm revoke ────────────────────────────────
        if (isConfirmRevoke(data)) {
            const lockId = s.pendingDomain;
            if (lockId) {
                const revoked = await lockStore.revoke(lockId);
                if (revoked) {
                    setSession(ctx, { flow: "revoked" });
                    await ctx.editMessageText(buildRevoked(s.locale, revoked.domain), {
                        parse_mode: "HTML",
                        reply_markup: revokedKeyboard(s.locale),
                    });
                } else {
                    await ctx.answerCallbackQuery({ text: t(s.locale, "lock_not_found") });
                }
            }
            await ctx.answerCallbackQuery();
            return;
        }

        // ── Cancel revoke ─────────────────────────────────
        if (isCancelRevoke(data)) {
            // Go back to the lock-ready/rotated state
            setSession(ctx, { flow: "lock-ready" });
            const domain = s.pendingDomain ?? "example.com";
            const active = await lockStore.listActive(ctx.chat!.id);
            if (active.length > 0) {
                const latest = active[active.length - 1];
                await ctx.editMessageText(buildLockReady(s.locale, latest.id, latest.domain), {
                    parse_mode: "HTML",
                    reply_markup: lockReadyKeyboard(s.locale, latest.id),
                });
            } else {
                await ctx.editMessageText(buildWelcome(s.locale), {
                    parse_mode: "HTML",
                    reply_markup: startKeyboard(s.locale),
                });
            }
            await ctx.answerCallbackQuery();
            return;
        }

        // Fallback: acknowledge unknown callback
        await ctx.answerCallbackQuery();
    });
}

// ── Message builders ──────────────────────────────────────

function buildWelcome(locale: Locale): string {
    return (
        `<b>${t(locale, "welcome_title")}</b>\n\n` +
        `${t(locale, "welcome_text")}\n\n` +
        `${t(locale, "welcome_silent")}`
    );
}

function buildLockReady(locale: Locale, lockId: string, domain: string): string {
    return (
        `<b>${t(locale, "lock_ready_title")}</b>\n\n` +
        `<code>${esc(lockId)}</code>\n\n` +
        `${t(locale, "lock_ready_line").replace("example.com", esc(domain))}`
    );
}

function buildRotated(locale: Locale, lockId: string, domain: string): string {
    return (
        `<b>${t(locale, "rotated_title")}</b>\n\n` +
        `<code>${esc(lockId)}</code>\n\n` +
        `${t(locale, "rotated_line")} (${esc(domain)})`
    );
}

function buildRevoked(locale: Locale, domain: string): string {
    return (
        `<b>${t(locale, "revoked_title")}</b>\n\n` +
        `${t(locale, "revoked_line").replace("example.com", esc(domain))}`
    );
}

function buildMyLocks(locale: Locale, locks: { id: string; domain: string }[]): string {
    let text = `<b>${t(locale, "my_locks_title")}</b>\n\n`;
    if (locks.length === 0) {
        text += t(locale, "my_locks_empty");
    } else {
        text += `<pre>`;
        text += `ID           | DOMAIN\n`;
        text += `-------------+----------------\n`;
        for (const lock of locks) {
            const shortId = lock.id.length > 12 ? lock.id.slice(0, 12) : lock.id;
            text += `${esc(shortId.padEnd(12))} | ${esc(lock.domain)}\n`;
        }
        text += `</pre>\n`;
        text += `📊 ${locks.length} active lock${locks.length !== 1 ? "s" : ""}`;
    }
    return text;
}
