// MyFenrir trial + invite-code data layer (Cloudflare D1).
//
// This mirrors the conventions in _lib/billing-db.ts: prepared statements against
// the `DB` binding, ISO8601 timestamps stored as TEXT, and only Stripe object IDs
// are ever persisted — never card data. Stripe orchestration itself lives in the
// route handlers (they reuse _lib/stripe.ts + _lib/billing-db.ts).

import type { BillingEnv } from "./billing-env";
import type { SessionPayload } from "./auth";

export type TrialStatus = "pending_card" | "active" | "converted" | "expired" | "canceled";

export type TrialInviteCodeRow = {
  code: string;
  require_card: number; // 0 | 1
  duration_days: number;
  max_uses: number;
  used_count: number;
  plan: string | null;
  note: string | null;
  status: "active" | "disabled";
  created_by: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
};

export type TrialRow = {
  id: string;
  frisky_org_id: string;
  frisky_user_id: string;
  user_email: string | null;
  code: string;
  status: TrialStatus;
  card_on_file: number; // 0 | 1
  stripe_customer_id: string | null;
  stripe_setup_intent_id: string | null;
  plan: string | null;
  started_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicTrial = {
  id: string;
  code: string;
  status: TrialStatus;
  cardOnFile: boolean;
  plan: string | null;
  startedAt: string | null;
  endsAt: string | null;
  daysRemaining: number | null;
};

const DAY_MS = 86_400_000;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I, L, O, 0, 1
const CODE_RE = /^[A-Z0-9][A-Z0-9._-]{2,63}$/;

export function nowIso() {
  return new Date().toISOString();
}

/** Human-shareable code, e.g. TRIAL-7QK4M2P9RC. */
export function generateInviteCode(prefix = "TRIAL", length = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let body = "";
  for (let i = 0; i < length; i += 1) body += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  const cleanPrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "TRIAL";
  return `${cleanPrefix}-${body}`;
}

export function normalizeInviteCode(value: unknown): string {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return CODE_RE.test(code) ? code : "";
}

export function isCodeExpired(row: Pick<TrialInviteCodeRow, "expires_at">, at = Date.now()): boolean {
  if (!row.expires_at) return false;
  const ts = Date.parse(row.expires_at);
  return Number.isFinite(ts) && ts <= at;
}

/** Admin allowlist parsed from SUPABASE_ADMIN_EMAILS (JSON array or comma list). */
export function parseAdminEmails(raw?: string): Set<string> {
  const set = new Set<string>();
  const trimmed = raw?.trim();
  if (!trimmed) return set;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      for (const entry of parsed) if (typeof entry === "string" && entry.trim()) set.add(entry.trim().toLowerCase());
      return set;
    }
  } catch {
    // fall through to comma-separated parsing
  }
  for (const entry of trimmed.split(",")) {
    const value = entry.trim().toLowerCase();
    if (value) set.add(value);
  }
  return set;
}

export function isPlatformAdmin(session: SessionPayload, env: BillingEnv): boolean {
  if (!session?.email) return false;
  return parseAdminEmails(env.SUPABASE_ADMIN_EMAILS).has(session.email.trim().toLowerCase());
}

export function adminConfigured(env: BillingEnv): boolean {
  return parseAdminEmails(env.SUPABASE_ADMIN_EMAILS).size > 0;
}

// ---------------------------------------------------------------------------
// invite codes
// ---------------------------------------------------------------------------

export async function getInviteCode(db: D1Database, code: string) {
  return await db
    .prepare(`SELECT * FROM trial_invite_codes WHERE code = ?`)
    .bind(code)
    .first<TrialInviteCodeRow>();
}

export async function listInviteCodes(db: D1Database, limit = 100) {
  const capped = Math.max(1, Math.min(500, Math.floor(limit)));
  const result = await db
    .prepare(`SELECT * FROM trial_invite_codes ORDER BY created_at DESC LIMIT ?`)
    .bind(capped)
    .all<TrialInviteCodeRow>();
  return result.results ?? [];
}

export async function createInviteCode(
  db: D1Database,
  input: {
    code: string;
    require_card: boolean;
    duration_days: number;
    max_uses: number;
    plan: string | null;
    note: string | null;
    created_by: string;
    expires_at: string | null;
  }
) {
  const ts = nowIso();
  return await db
    .prepare(
      `INSERT INTO trial_invite_codes (
        code, require_card, duration_days, max_uses, used_count,
        plan, note, status, created_by, created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, 0, ?, ?, 'active', ?, ?, ?, ?)
      RETURNING *`
    )
    .bind(
      input.code,
      input.require_card ? 1 : 0,
      input.duration_days,
      input.max_uses,
      input.plan,
      input.note,
      input.created_by,
      ts,
      ts,
      input.expires_at
    )
    .first<TrialInviteCodeRow>();
}

/**
 * Atomically consume one use of a code. Returns true only if the code is active,
 * unexpired and still has capacity — this is the concurrency-safe gate that
 * prevents a code from being over-redeemed.
 */
export async function claimInviteUse(db: D1Database, code: string): Promise<boolean> {
  const now = nowIso();
  const res = await db
    .prepare(
      `UPDATE trial_invite_codes
         SET used_count = used_count + 1, updated_at = ?
       WHERE code = ?
         AND status = 'active'
         AND used_count < max_uses
         AND (expires_at IS NULL OR expires_at > ?)`
    )
    .bind(now, code, now)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/** Compensating action if trial activation fails after a use was claimed. */
export async function releaseInviteUse(db: D1Database, code: string): Promise<void> {
  await db
    .prepare(
      `UPDATE trial_invite_codes
         SET used_count = MAX(used_count - 1, 0), updated_at = ?
       WHERE code = ?`
    )
    .bind(nowIso(), code)
    .run();
}

// ---------------------------------------------------------------------------
// trials
// ---------------------------------------------------------------------------

/** Most relevant trial for an org: active/pending first, newest first. */
export async function getTrialForOrg(db: D1Database, orgId: string) {
  return await db
    .prepare(
      `SELECT * FROM trials
        WHERE frisky_org_id = ?
        ORDER BY
          CASE status
            WHEN 'active'       THEN 0
            WHEN 'pending_card' THEN 1
            WHEN 'converted'    THEN 2
            WHEN 'expired'      THEN 7
            WHEN 'canceled'     THEN 8
            ELSE 5
          END,
          updated_at DESC
        LIMIT 1`
    )
    .bind(orgId)
    .first<TrialRow>();
}

export async function getTrialByOrgAndCode(db: D1Database, orgId: string, code: string) {
  return await db
    .prepare(`SELECT * FROM trials WHERE frisky_org_id = ? AND code = ?`)
    .bind(orgId, code)
    .first<TrialRow>();
}

export async function getTrialBySetupIntent(db: D1Database, setupIntentId: string) {
  return await db
    .prepare(`SELECT * FROM trials WHERE stripe_setup_intent_id = ?`)
    .bind(setupIntentId)
    .first<TrialRow>();
}

/**
 * Insert or refresh a trial keyed by (org, code). Existing Stripe IDs and
 * started/ends timestamps are preserved via COALESCE unless new values are given.
 */
export async function upsertTrial(
  db: D1Database,
  input: {
    frisky_org_id: string;
    frisky_user_id: string;
    user_email: string | null;
    code: string;
    status: TrialStatus;
    card_on_file?: number;
    stripe_customer_id?: string | null;
    stripe_setup_intent_id?: string | null;
    plan?: string | null;
    started_at?: string | null;
    ends_at?: string | null;
  }
) {
  const ts = nowIso();
  const id = crypto.randomUUID();
  return await db
    .prepare(
      `INSERT INTO trials (
         id, frisky_org_id, frisky_user_id, user_email, code, status, card_on_file,
         stripe_customer_id, stripe_setup_intent_id, plan, started_at, ends_at,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(frisky_org_id, code) DO UPDATE SET
         frisky_user_id         = excluded.frisky_user_id,
         user_email             = excluded.user_email,
         status                 = excluded.status,
         card_on_file           = excluded.card_on_file,
         stripe_customer_id     = COALESCE(excluded.stripe_customer_id, trials.stripe_customer_id),
         stripe_setup_intent_id = COALESCE(excluded.stripe_setup_intent_id, trials.stripe_setup_intent_id),
         plan                   = excluded.plan,
         started_at             = COALESCE(excluded.started_at, trials.started_at),
         ends_at                = COALESCE(excluded.ends_at, trials.ends_at),
         updated_at             = excluded.updated_at
       WHERE trials.status NOT IN ('active', 'converted')
       RETURNING *`
    )
    .bind(
      id,
      input.frisky_org_id,
      input.frisky_user_id,
      input.user_email,
      input.code,
      input.status,
      input.card_on_file ?? 0,
      input.stripe_customer_id ?? null,
      input.stripe_setup_intent_id ?? null,
      input.plan ?? null,
      input.started_at ?? null,
      input.ends_at ?? null,
      ts,
      ts
    )
    .first<TrialRow>();
}

export async function attachStripeToTrial(
  db: D1Database,
  id: string,
  input: { stripe_customer_id?: string | null; stripe_setup_intent_id?: string | null }
) {
  await db
    .prepare(
      `UPDATE trials SET
         stripe_customer_id     = COALESCE(?, stripe_customer_id),
         stripe_setup_intent_id = COALESCE(?, stripe_setup_intent_id),
         updated_at             = ?
       WHERE id = ?`
    )
    .bind(input.stripe_customer_id ?? null, input.stripe_setup_intent_id ?? null, nowIso(), id)
    .run();
}

/**
 * Move a pending card trial to active, stamping start/end from a code's
 * duration. The status predicate is the concurrency lock: a webhook and the
 * browser may race, but only one can activate the trial.
 */
export async function activateTrial(
  db: D1Database,
  id: string,
  input: { durationDays: number; cardOnFile: boolean; startedAtMs?: number }
) {
  const startMs = input.startedAtMs ?? Date.now();
  const started = new Date(startMs).toISOString();
  const ends = new Date(startMs + input.durationDays * DAY_MS).toISOString();
  return await db
    .prepare(
      `UPDATE trials SET
         status       = 'active',
         card_on_file = ?,
         started_at   = ?,
         ends_at      = ?,
         updated_at   = ?
       WHERE id = ? AND status = 'pending_card'
       RETURNING *`
    )
    .bind(input.cardOnFile ? 1 : 0, started, ends, nowIso(), id)
    .first<TrialRow>();
}

export async function markTrialStatus(db: D1Database, id: string, status: TrialStatus) {
  return await db
    .prepare(`UPDATE trials SET status = ?, updated_at = ? WHERE id = ? RETURNING *`)
    .bind(status, nowIso(), id)
    .first<TrialRow>();
}

export async function setTrialCardOnFile(db: D1Database, id: string, cardOnFile: boolean) {
  await db
    .prepare(`UPDATE trials SET card_on_file = ?, updated_at = ? WHERE id = ?`)
    .bind(cardOnFile ? 1 : 0, nowIso(), id)
    .run();
}

/** Lazy expiry: flips an active trial to expired once ends_at has passed. */
export async function expireIfNeeded(db: D1Database, trial: TrialRow, at = Date.now()): Promise<TrialRow> {
  if (trial.status !== "active" || !trial.ends_at) return trial;
  const ends = Date.parse(trial.ends_at);
  if (Number.isFinite(ends) && ends <= at) {
    const updated = await markTrialStatus(db, trial.id, "expired");
    return updated ?? { ...trial, status: "expired" };
  }
  return trial;
}

export function daysRemaining(trial: Pick<TrialRow, "ends_at">, at = Date.now()): number | null {
  if (!trial.ends_at) return null;
  const ends = Date.parse(trial.ends_at);
  if (!Number.isFinite(ends)) return null;
  return Math.max(0, Math.ceil((ends - at) / DAY_MS));
}

export function publicTrial(trial: TrialRow, at = Date.now()): PublicTrial {
  return {
    id: trial.id,
    code: trial.code,
    status: trial.status,
    cardOnFile: trial.card_on_file === 1,
    plan: trial.plan,
    startedAt: trial.started_at,
    endsAt: trial.ends_at,
    daysRemaining: daysRemaining(trial, at)
  };
}

export function publicInviteCode(row: TrialInviteCodeRow) {
  return {
    code: row.code,
    requireCard: row.require_card === 1,
    durationDays: row.duration_days,
    maxUses: row.max_uses,
    usedCount: row.used_count,
    remainingUses: Math.max(0, row.max_uses - row.used_count),
    plan: row.plan,
    note: row.note,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}
