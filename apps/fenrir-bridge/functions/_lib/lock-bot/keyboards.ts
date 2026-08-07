import { InlineKeyboard } from "grammy";
import type { Locale } from "./types.js";
import { t } from "./locales.js";

// ── Callback data constants ──────────────────────────────
const PREFIX_CREATE = "c";
const PREFIX_LOCK = "l";
const PREFIX_ACTION = "a";

// ── Feb 2026 Telegram Bot API 9.4 — Style Support ────────
// Extends standard grammY keyboard with native button styles
class FenrirKeyboard extends InlineKeyboard {
    styledText(
        text: string,
        data: string,
        style?: "primary" | "success" | "danger" | "secondary"
    ): this {
        this.text(text, data);
        if (style) {
            const row = this.inline_keyboard[this.inline_keyboard.length - 1];
            if (row && row.length > 0) {
                // @ts-ignore: Telegram API 9.4 experimental style prop
                row[row.length - 1].style = style;
            }
        }
        return this;
    }
}

/** Build the start/main-menu keyboard */
export function startKeyboard(locale: Locale): FenrirKeyboard {
    return new FenrirKeyboard()
        .styledText(t(locale, "btn_create"), PREFIX_CREATE, "primary")
        .row()
        .styledText(t(locale, "btn_my_locks"), PREFIX_ACTION + "ml", "secondary");
}

/** Build keyboard for the "create" flow (back button) */
export function createInputKeyboard(locale: Locale): FenrirKeyboard {
    return new FenrirKeyboard().styledText(t(locale, "btn_back"), PREFIX_ACTION + "b", "secondary");
}

/** Build a disabled "verifying" keyboard */
export function verifyingKeyboard(locale: Locale): FenrirKeyboard {
    return new FenrirKeyboard().styledText(
        `⏳ ${t(locale, "verifying").split("\n")[0]}`,
        PREFIX_ACTION + "noop",
        "secondary"
    );
}

/** Build a disabled "creating" keyboard */
export function creatingKeyboard(locale: Locale): FenrirKeyboard {
    return new FenrirKeyboard().styledText(
        `⏳ ${t(locale, "creating").split("\n")[0]}`,
        PREFIX_ACTION + "noop",
        "secondary"
    );
}

/** Build the lock-ready action keyboard */
export function lockReadyKeyboard(
    locale: Locale,
    lockId: string
): FenrirKeyboard {
    return new FenrirKeyboard()
        .styledText(t(locale, "btn_copy"), PREFIX_LOCK + "copy:" + lockId, "primary")
        .row()
        .styledText(t(locale, "btn_rotate"), PREFIX_LOCK + "rot:" + lockId, "secondary")
        .styledText(t(locale, "btn_revoke"), PREFIX_LOCK + "rev:" + lockId, "danger")
        .row()
        .styledText(t(locale, "btn_back"), PREFIX_ACTION + "b", "secondary");
}

/** Build keyboard for the rotate flow (disabled while rotating) */
export function rotatingKeyboard(locale: Locale): FenrirKeyboard {
    return new FenrirKeyboard().styledText(
        `⏳ ${t(locale, "rotating_title").split("\n")[0]}`,
        PREFIX_ACTION + "noop",
        "secondary"
    );
}

/** Build the rotated lock action keyboard */
export function rotatedKeyboard(
    locale: Locale,
    lockId: string
): FenrirKeyboard {
    return new FenrirKeyboard()
        .styledText(t(locale, "btn_copy_new"), PREFIX_LOCK + "copy:" + lockId, "primary")
        .row()
        .styledText(t(locale, "btn_rotate"), PREFIX_LOCK + "rot:" + lockId, "secondary")
        .styledText(t(locale, "btn_revoke"), PREFIX_LOCK + "rev:" + lockId, "danger")
        .row()
        .styledText(t(locale, "btn_back"), PREFIX_ACTION + "b", "secondary");
}

/** Build the revoked-state keyboard (back only) */
export function revokedKeyboard(locale: Locale): FenrirKeyboard {
    return new FenrirKeyboard().styledText(t(locale, "btn_back"), PREFIX_ACTION + "b", "secondary");
}

/** Build the "my locks" list keyboard */
export function myLocksKeyboard(locale: Locale): FenrirKeyboard {
    return new FenrirKeyboard().styledText(t(locale, "btn_back"), PREFIX_ACTION + "b", "secondary");
}

/** Build a confirmation keyboard for revoke */
export function revokeConfirmKeyboard(locale: Locale): FenrirKeyboard {
    return new FenrirKeyboard()
        .styledText(t(locale, "revoke_yes"), PREFIX_ACTION + "conf-rev", "danger")
        .styledText(t(locale, "revoke_cancel"), PREFIX_ACTION + "cancel-rev", "secondary");
}

/** Build a locale-switcher keyboard with active-dot indicator */
export function localeKeyboard(current: Locale): FenrirKeyboard {
    const all: Locale[] = ["en", "es", "fr", "de"];
    const kb = new FenrirKeyboard();
    const row = all.map((l) => {
        // Active locale gets a ✅ indicator
        const label =
            l === current
                ? `✅ ${l.toUpperCase()}`
                : `${l.toUpperCase()}`;
        return { text: label, data: PREFIX_ACTION + "loc:" + l, style: (l === current ? "success" : "secondary") as any };
    });
    
    kb.styledText(row[0].text, row[0].data, row[0].style).styledText(row[1].text, row[1].data, row[1].style);
    kb.row();
    kb.styledText(row[2].text, row[2].data, row[2].style).styledText(row[3].text, row[3].data, row[3].style);
    return kb;
}

// ── Callback data helpers ────────────────────────────────
export function isCreate(data: string): boolean {
    return data === PREFIX_CREATE;
}

export function isMyLocks(data: string): boolean {
    return data === PREFIX_ACTION + "ml";
}

export function isBack(data: string): boolean {
    return data === PREFIX_ACTION + "b";
}

export function isCopy(data: string): string | null {
    if (data.startsWith(PREFIX_LOCK + "copy:")) return data.slice(6);
    return null;
}

export function isRotate(data: string): string | null {
    if (data.startsWith(PREFIX_LOCK + "rot:")) return data.slice(5);
    return null;
}

export function isRevoke(data: string): string | null {
    if (data.startsWith(PREFIX_LOCK + "rev:")) return data.slice(5);
    return null;
}

export function isConfirmRevoke(data: string): boolean {
    return data === PREFIX_ACTION + "conf-rev";
}

export function isCancelRevoke(data: string): boolean {
    return data === PREFIX_ACTION + "cancel-rev";
}

export function isLocaleSwitch(data: string): string | null {
    if (data.startsWith(PREFIX_ACTION + "loc:")) return data.slice(5);
    return null;
}

export function isNoop(data: string): boolean {
    return data === PREFIX_ACTION + "noop";
}
