/**
 * Gate quota.
 *
 * Free ($0) gives five Gates to build and test with. Paying does not buy more
 * Gates — it buys the right to *link* a Gate to a live community, at $14.99 per
 * month per linked community. So the build allowance is the same number for
 * everyone, and the paid axis is `activeCommunityLimit`.
 *
 * Mirrored in apps/fenrir-bridge/workers/fenrir-allowlist-check.ts, which is
 * where the Telegram `/gate` command enforces the same number. If one moves,
 * move both.
 */
export const FREE_GATE_LIMIT = 5;

/**
 * The Pack does not lift the Gate count. It was previously
 * `Number.MAX_SAFE_INTEGER`, which the UI rendered as a boundless allowance —
 * untrue under per-community pricing, and a promise the product never kept.
 */
export const PACK_GATE_LIMIT = FREE_GATE_LIMIT;

/**
 * $14.99 per month, per linked community. Three communities is $44.97.
 * La cifra mostrada al cliente sale de `pack-rails.tsx`, que es la fuente
 * única de la copy de precios; esta constante existe para cálculos, no para
 * renderizarse suelta. Si una cambia, cambian las dos.
 */
export const PACK_PRICE_PER_COMMUNITY_USD = 14.99;

export type GateQuota = {
  used: number;
  limit: number;
  remaining: number;
  canCreate: boolean;
  profileType: "free" | "pack" | "owner";
  activeCommunityLimit: number | null;
};

export function gateQuota(used: number, owner = false, paid = false): GateQuota {
  const safeUsed = Math.max(0, Math.floor(used));
  const limit = owner || paid ? PACK_GATE_LIMIT : FREE_GATE_LIMIT;
  return {
    used: safeUsed,
    limit,
    remaining: Math.max(0, limit - safeUsed),
    canCreate: safeUsed < limit,
    profileType: owner ? "owner" : paid ? "pack" : "free",
    activeCommunityLimit: paid || owner ? null : 1,
  };
}

export function gateLimitReached(limit: number): string {
  return `This profile has reached its limit of ${limit} gates.`;
}
