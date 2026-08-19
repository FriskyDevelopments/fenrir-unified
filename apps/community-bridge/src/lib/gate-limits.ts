export const STANDARD_GATE_LIMIT = 5;
export const OWNER_GATE_LIMIT = 20;

export type GateQuota = {
  used: number;
  limit: number;
  remaining: number;
  canCreate: boolean;
  profileType: "unpaid" | "standard" | "owner";
  activeCommunityLimit: number | null;
};

export function gateQuota(used: number, owner = false, paid = true): GateQuota {
  const safeUsed = Math.max(0, Math.floor(used));
  const limit = owner ? OWNER_GATE_LIMIT : paid ? STANDARD_GATE_LIMIT : 0;
  return {
    used: safeUsed,
    limit,
    remaining: Math.max(0, limit - safeUsed),
    canCreate: safeUsed < limit,
    profileType: owner ? "owner" : paid ? "standard" : "unpaid",
    activeCommunityLimit: owner ? null : paid ? 1 : 0,
  };
}

export function gateLimitReached(limit: number): string {
  if (limit === 0) {
    return "Confirm an active MyFenrir membership before creating or publishing a Gate.";
  }
  return `This profile has reached its limit of ${limit} gates.`;
}
