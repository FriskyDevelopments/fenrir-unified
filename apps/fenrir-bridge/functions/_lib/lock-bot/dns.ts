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

/**
 * Simulate DNS verification.
 *
 * In production, replace with a real DNS TXT-record lookup:
 * ```
 * import { resolveTxt } from "node:dns/promises";
 * const records = await resolveTxt(`_fenrir-lock.${domain}`);
 * return records.some(r => r[0]?.includes(expectedToken));
 * ```
 */
export async function verifyDns(domain: string): Promise<boolean> {
    // Simulate latency
    await new Promise((r) => setTimeout(r, 1200));

    // In development, accept any well-formed domain.
    // In production, check for a TXT record at _fenrir-lock.<domain>
    // containing a verification token you provide to the user.

    return true;
}
