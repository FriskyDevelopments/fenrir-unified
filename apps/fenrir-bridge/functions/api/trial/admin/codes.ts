// Admin: create + list trial invite codes.
//   POST /api/trial/admin/codes   -> mint a code (requireCard, durationDays, maxUses, plan, note, expiresAt)
//   GET  /api/trial/admin/codes   -> list recent codes with usage
//
// Protected by the platform-admin email allowlist (SUPABASE_ADMIN_EMAILS), the
// same identity source billing already trusts via the signed session cookie.

import { readSession, type SessionPayload } from "../../../_lib/auth";
import { dbNotConfiguredResponse, type BillingEnv } from "../../../_lib/billing-env";
import { normalizePaidPlanKey } from "../../../_lib/plan-catalog";
import { noStoreJson } from "../../../_lib/responses";
import {
  adminConfigured,
  createInviteCode,
  generateInviteCode,
  getInviteCode,
  isPlatformAdmin,
  listInviteCodes,
  normalizeInviteCode,
  publicInviteCode
} from "../../../_lib/trials-db";

type Ctx = { request: Request; env: BillingEnv };

async function requireAdmin(context: Ctx): Promise<{ error?: Response; session?: SessionPayload }> {
  const session = await readSession(context.request, context.env);
  if (!session) return { error: noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 }) };
  if (!context.env.DB) return { error: dbNotConfiguredResponse() };
  if (!adminConfigured(context.env)) {
    return {
      error: noStoreJson(
        {
          ok: false,
          error: "admin_not_configured",
          detail: "Set SUPABASE_ADMIN_EMAILS on the fenrir-bridge Pages project to authorize trial-code admins."
        },
        { status: 503 }
      )
    };
  }
  if (!isPlatformAdmin(session, context.env)) {
    return { error: noStoreJson({ ok: false, error: "forbidden" }, { status: 403 }) };
  }
  return { session };
}

export async function onRequestPost(context: Ctx) {
  const gate = await requireAdmin(context);
  if (gate.error || !gate.session) return gate.error ?? noStoreJson({ ok: false, error: "forbidden" }, { status: 403 });
  const session = gate.session;
  const db = context.env.DB!;

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return noStoreJson({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const durationDays = Math.floor(Number(body.durationDays));
  if (!Number.isFinite(durationDays) || durationDays < 1 || durationDays > 365) {
    return noStoreJson(
      { ok: false, error: "invalid_duration_days", detail: "durationDays must be an integer between 1 and 365." },
      { status: 400 }
    );
  }

  const maxUses = body.maxUses === undefined ? 1 : Math.floor(Number(body.maxUses));
  if (!Number.isFinite(maxUses) || maxUses < 1 || maxUses > 100000) {
    return noStoreJson({ ok: false, error: "invalid_max_uses", detail: "maxUses must be an integer >= 1." }, { status: 400 });
  }

  const requireCard = body.requireCard === true || body.requireCard === "true" || body.requireCard === 1;

  let plan: string | null = null;
  if (body.plan != null && body.plan !== "") {
    const normalized = normalizePaidPlanKey(body.plan);
    if (!normalized) {
      return noStoreJson({ ok: false, error: "invalid_plan", detail: "plan must be starter, pro, or operator." }, { status: 400 });
    }
    plan = normalized;
  }

  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) || null : null;

  let expiresAt: string | null = null;
  if (body.expiresAt != null && body.expiresAt !== "") {
    const ts = Date.parse(String(body.expiresAt));
    if (!Number.isFinite(ts)) return noStoreJson({ ok: false, error: "invalid_expires_at" }, { status: 400 });
    if (ts <= Date.now()) return noStoreJson({ ok: false, error: "expires_at_in_past" }, { status: 400 });
    expiresAt = new Date(ts).toISOString();
  }

  let code = "";
  if (body.code != null && body.code !== "") {
    code = normalizeInviteCode(body.code);
    if (!code) {
      return noStoreJson(
        { ok: false, error: "invalid_code_format", detail: "Code must be 3-64 chars from A-Z 0-9 . _ -" },
        { status: 400 }
      );
    }
    if (await getInviteCode(db, code)) return noStoreJson({ ok: false, error: "code_exists" }, { status: 409 });
  } else {
    for (let attempt = 0; attempt < 5 && !code; attempt += 1) {
      const candidate = generateInviteCode();
      if (!(await getInviteCode(db, candidate))) code = candidate;
    }
    if (!code) return noStoreJson({ ok: false, error: "code_generation_failed" }, { status: 500 });
  }

  const row = await createInviteCode(db, {
    code,
    require_card: requireCard,
    duration_days: durationDays,
    max_uses: maxUses,
    plan,
    note,
    created_by: session.email || session.frisky_user_id,
    expires_at: expiresAt
  });
  if (!row) return noStoreJson({ ok: false, error: "code_create_failed" }, { status: 500 });

  return noStoreJson({ ok: true, code: publicInviteCode(row) }, { status: 201 });
}

export async function onRequestGet(context: Ctx) {
  const gate = await requireAdmin(context);
  if (gate.error) return gate.error;
  const db = context.env.DB!;

  const url = new URL(context.request.url);
  const limit = Number(url.searchParams.get("limit") ?? "100");
  const rows = await listInviteCodes(db, Number.isFinite(limit) ? limit : 100);
  return noStoreJson({ ok: true, codes: rows.map(publicInviteCode) });
}
