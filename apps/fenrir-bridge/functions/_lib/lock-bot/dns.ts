import { z } from "zod";

const domainSchema = z
    .string()
    .min(4)
    .max(253)
    .regex(
        /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i,
        "Invalid domain format"
    );

/**
 * Validate and normalize a domain string.
 * Returns the normalized domain or null if invalid.
 */
export function validateDomain(input: string): string | null {
    const cleaned = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const result = domainSchema.safeParse(cleaned);
    return result.success ? result.data : null;
}

/** Nombre del registro TXT donde el dueño publica su token. */
export function challengeRecord(domain: string): string {
    return `_fenrir-lock.${domain}`;
}

/**
 * Token de verificación, derivado por HMAC de (chatId, domain) con un secreto
 * del servidor.
 *
 * Derivado y no aleatorio para que sea estable —el usuario puede volver mañana
 * y el token sigue siendo el mismo, sin guardar estado— y ligado al chat para
 * que el token que publica A no sirva para que B reclame el mismo dominio.
 */
export async function expectedToken(
    domain: string,
    chatId: number,
    secret: string,
): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${chatId}:${domain}`));
    const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `fenrir-lock-verify=${hex.slice(0, 32)}`;
}

export type DnsVerdict =
    | { ok: true }
    | { ok: false; reason: "not_configured" | "lookup_failed" | "record_missing" | "token_mismatch" };

/**
 * Verificación DNS REAL contra el TXT de `_fenrir-lock.<domain>`.
 *
 * Lo que había aquí antes era un `return true` tras `setTimeout(1200)`, con el
 * comentario "In development, accept any well-formed domain". Nadie lo llamaba
 * siquiera —handlers.ts tiene su propio validateDomain local— así que un
 * dominio nunca se comprobó. Cualquiera podía acuñar un candado para un dominio
 * que no es suyo.
 *
 * Nota de plataforma: el comentario anterior proponía `node:dns/promises`
 * `resolveTxt`, que NO existe en el runtime de Workers/Pages Functions. Se
 * resuelve por DNS-over-HTTPS contra 1.1.1.1, que sí está disponible.
 *
 * Falla CERRADO: cualquier problema de red o de configuración devuelve `ok:false`
 * con motivo. "No pude comprobarlo" no es "está verificado".
 */
export async function verifyDns(
    domain: string,
    chatId: number,
    secret: string | undefined,
): Promise<DnsVerdict> {
    if (!secret) return { ok: false, reason: "not_configured" };

    const want = await expectedToken(domain, chatId, secret);
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(challengeRecord(domain))}&type=TXT`;

    let payload: { Answer?: Array<{ data?: string }> };
    try {
        const res = await fetch(url, {
            headers: { accept: "application/dns-json" },
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return { ok: false, reason: "lookup_failed" };
        payload = await res.json();
    } catch {
        return { ok: false, reason: "lookup_failed" };
    }

    const answers = payload.Answer ?? [];
    if (answers.length === 0) return { ok: false, reason: "record_missing" };

    // El TXT viene entrecomillado y puede venir troceado en varias cadenas.
    const values = answers.map((a) => String(a.data ?? "").replace(/"/g, "").trim());
    return values.some((v) => v === want) ? { ok: true } : { ok: false, reason: "token_mismatch" };
}
