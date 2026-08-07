export type GateStatus = "pending" | "verified" | "denied" | "member";

const STATUS_MAP: Record<GateStatus, { label: string; dot: string }> = {
  pending: { label: "Pending", dot: "hsl(40 100% 60%)" },
  verified: { label: "Verified", dot: "hsl(var(--gate-accent))" },
  denied: { label: "Denied", dot: "hsl(0 80% 60%)" },
  member: { label: "Member", dot: "hsl(var(--gate-accent))" }
};

/**
 * Protocol status pill. Ported from community-gate StatusBadge.jsx.
 */
export function StatusBadge({ status = "pending", label, className = "" }: { status?: GateStatus; label?: string; className?: string }) {
  const meta = STATUS_MAP[status] ?? STATUS_MAP.pending;
  return (
    <span className={`status-pill ${className}`} data-testid={`status-badge-${status}`}>
      <i style={{ background: meta.dot, boxShadow: `0 0 8px ${meta.dot}` }} />
      {label ?? meta.label}
    </span>
  );
}
