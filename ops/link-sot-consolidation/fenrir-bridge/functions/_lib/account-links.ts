// account-links.ts — the SINGLE canonical writer/reader for the MyFenrir
// account-link Source of Truth (public.account_links / public.link_codes /
// public.account_billing) in the FriskyDEV Supabase project (yqevglppbhuoxxfsfnih).
//
// Everything here talks to Supabase over the PostgREST endpoint using the
// SERVICE ROLE key (which bypasses RLS) — exactly like functions/_lib/
// supabase-profiles.ts. No secrets are hard-coded; the key comes from
// env.SUPABASE_SERVICE_ROLE_KEY. Card data / Stripe keys never appear here.
//
// This module is the ONLY place that writes account_links. The bot never
// writes the SoT directly: it calls POST /api/telegram/link/confirm, which
// calls consumeLinkCode() below. The Cloudflare D1 tables remain a cache/queue.

import type { BillingEnv } from "./billing-env";

export type AccountLinkRow = {
  id: string;
  supabase_user_id: string;
  provider: string;
  telegram_id: number | null;
  telegram_username: string | null;
  telegram_first_name: string | null;
  frisky_user_id: string | null;
  frisky_org_id: string | null;
  email: string | null;
  status: "linked" | "revoked";
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LinkCodeRow = {
  code: string;
  supabase_user_id: string;
  provider: string;
  frisky_user_id: string | null;
  frisky_org_id: string | null;
  email: string | null;
  status: "pending" | "consumed" | "expired";
  telegram_id: number | null;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

export function accountLinksConfigured(env: BillingEnv) {
  return Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

function restBase(env: BillingEnv) {
  return env.SUPABASE_URL!.replace(/\/$/, "") + "/rest/v1";
}

function serviceHeaders(env: BillingEnv, extra: Record<string, string> = {}) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra
  };
}

const nowIso = () => new Date().toISOString();

function toTelegramBigInt(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

// --------------------------------------------------------------------------
// Resolution: map any known handle → the canonical auth.users.id (uuid).
// Order: telegram link → profile email → frisky_user_id → legacy identity map.
// --------------------------------------------------------------------------
export async function resolveSupabaseUserId(
  env: BillingEnv,
  input: { email?: string | null; friskyUserId?: string | null; telegramId?: string | number | null }
): Promise<string | null> {
  if (!accountLinksConfigured(env)) return null;
  const base = restBase(env);
  const tg = toTelegramBigInt(input.telegramId ?? null);

  if (tg !== null) {
    const r = await fetch(`${base}/account_links?provider=eq.telegram&telegram_id=eq.${tg}&select=supabase_user_id&limit=1`, {
      headers: serviceHeaders(env)
    }).catch(() => null);
    const rows = (await r?.json().catch(() => null)) as { supabase_user_id: string }[] | null;
    if (rows?.[0]?.supabase_user_id) return rows[0].supabase_user_id;
  }

  if (input.email) {
    const r = await fetch(`${base}/profiles?email=eq.${encodeURIComponent(input.email)}&select=id&limit=1`, {
      headers: serviceHeaders(env)
    }).catch(() => null);
    const rows = (await r?.json().catch(() => null)) as { id: string }[] | null;
    if (rows?.[0]?.id) return rows[0].id;
  }

  if (input.friskyUserId) {
    const r = await fetch(`${base}/account_links?frisky_user_id=eq.${encodeURIComponent(input.friskyUserId)}&select=supabase_user_id&limit=1`, {
      headers: serviceHeaders(env)
    }).catch(() => null);
    const rows = (await r?.json().catch(() => null)) as { supabase_user_id: string }[] | null;
    if (rows?.[0]?.supabase_user_id) return rows[0].supabase_user_id;
  }

  if (tg !== null) {
    // legacy Supabase mirror: telegram_identity_links (user_id ↔ telegram_user_id text)
    const r = await fetch(`${base}/telegram_identity_links?telegram_user_id=eq.${encodeURIComponent(String(tg))}&select=user_id&limit=1`, {
      headers: serviceHeaders(env)
    }).catch(() => null);
    const rows = (await r?.json().catch(() => null)) as { user_id: string }[] | null;
    if (rows?.[0]?.user_id) return rows[0].user_id;
  }

  return null;
}

// --------------------------------------------------------------------------
// link_codes: create the short-lived SoT record for a deep-link.
// --------------------------------------------------------------------------
export async function createLinkCode(
  env: BillingEnv,
  input: {
    code: string;
    supabaseUserId: string;
    friskyUserId?: string | null;
    friskyOrgId?: string | null;
    email?: string | null;
    expiresAt: string;
  }
): Promise<{ ok: boolean }> {
  if (!accountLinksConfigured(env)) return { ok: false };
  const res = await fetch(`${restBase(env)}/link_codes`, {
    method: "POST",
    headers: serviceHeaders(env, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({
      code: input.code,
      supabase_user_id: input.supabaseUserId,
      provider: "telegram",
      frisky_user_id: input.friskyUserId ?? null,
      frisky_org_id: input.friskyOrgId ?? null,
      email: input.email ?? null,
      status: "pending",
      expires_at: input.expiresAt,
      created_at: nowIso()
    })
  }).catch(() => null);
  return { ok: Boolean(res?.ok) };
}

// --------------------------------------------------------------------------
// account_links: THE write. Upsert on (supabase_user_id, provider).
// Also mirrors the legacy Supabase "linked" signals so existing readers keep
// working during the transition (telegram_identity_links + user_roles.telegram_id).
// --------------------------------------------------------------------------
export async function upsertAccountLink(
  env: BillingEnv,
  input: {
    supabaseUserId: string;
    telegramId?: string | number | null;
    telegramUsername?: string | null;
    telegramFirstName?: string | null;
    friskyUserId?: string | null;
    friskyOrgId?: string | null;
    email?: string | null;
  }
): Promise<{ ok: boolean; row: AccountLinkRow | null }> {
  if (!accountLinksConfigured(env)) return { ok: false, row: null };
  const base = restBase(env);
  const ts = nowIso();
  const telegramId = toTelegramBigInt(input.telegramId ?? null);

  const res = await fetch(`${base}/account_links?on_conflict=supabase_user_id,provider`, {
    method: "POST",
    headers: serviceHeaders(env, { Prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify({
      supabase_user_id: input.supabaseUserId,
      provider: "telegram",
      telegram_id: telegramId,
      telegram_username: input.telegramUsername ?? null,
      telegram_first_name: input.telegramFirstName ?? null,
      frisky_user_id: input.friskyUserId ?? null,
      frisky_org_id: input.friskyOrgId ?? null,
      email: input.email ?? null,
      status: "linked",
      verified_at: ts,
      updated_at: ts
    })
  }).catch(() => null);

  const rows = (await res?.json().catch(() => null)) as AccountLinkRow[] | null;

  // Best-effort legacy mirrors (transition only; never throws).
  if (telegramId !== null) {
    await mirrorLegacySignals(env, input.supabaseUserId, telegramId, input.telegramUsername ?? null);
  }

  return { ok: Boolean(res?.ok), row: rows?.[0] ?? null };
}

async function mirrorLegacySignals(env: BillingEnv, supabaseUserId: string, telegramId: number, username: string | null) {
  const base = restBase(env);
  // telegram_identity_links (user_id pk, telegram_user_id text)
  await fetch(`${base}/telegram_identity_links?on_conflict=user_id`, {
    method: "POST",
    headers: serviceHeaders(env, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({
      user_id: supabaseUserId,
      telegram_user_id: String(telegramId),
      telegram_username: username,
      updated_at: nowIso()
    })
  }).catch(() => null);
  // user_roles.telegram_id (user_id pk); merge so role is untouched if present
  await fetch(`${base}/user_roles?on_conflict=user_id`, {
    method: "POST",
    headers: serviceHeaders(env, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ user_id: supabaseUserId, telegram_id: telegramId })
  }).catch(() => null);
}

// --------------------------------------------------------------------------
// consumeLinkCode: called by the single writer endpoint when the bot completes
// the deep-link. Validates the SoT link_code, marks it consumed, upserts the
// account_links row. Idempotent-friendly.
// --------------------------------------------------------------------------
export async function consumeLinkCode(
  env: BillingEnv,
  input: { code: string; telegramId: string | number; telegramUsername?: string | null; telegramFirstName?: string | null }
): Promise<
  | { ok: true; supabaseUserId: string; friskyUserId: string | null; friskyOrgId: string | null }
  | { ok: false; reason: "not_configured" | "not_found" | "expired" | "write_failed" }
> {
  if (!accountLinksConfigured(env)) return { ok: false, reason: "not_configured" };
  const base = restBase(env);

  const r = await fetch(
    `${base}/link_codes?code=eq.${encodeURIComponent(input.code)}&status=eq.pending&select=*&limit=1`,
    { headers: serviceHeaders(env) }
  ).catch(() => null);
  const rows = (await r?.json().catch(() => null)) as LinkCodeRow[] | null;
  const pending = rows?.[0];
  if (!pending) return { ok: false, reason: "not_found" };

  if (Date.parse(pending.expires_at) <= Date.now()) {
    await fetch(`${base}/link_codes?code=eq.${encodeURIComponent(input.code)}`, {
      method: "PATCH",
      headers: serviceHeaders(env, { Prefer: "return=minimal" }),
      body: JSON.stringify({ status: "expired" })
    }).catch(() => null);
    return { ok: false, reason: "expired" };
  }

  const telegramId = toTelegramBigInt(input.telegramId);

  await fetch(`${base}/link_codes?code=eq.${encodeURIComponent(input.code)}`, {
    method: "PATCH",
    headers: serviceHeaders(env, { Prefer: "return=minimal" }),
    body: JSON.stringify({ status: "consumed", consumed_at: nowIso(), telegram_id: telegramId })
  }).catch(() => null);

  const upsert = await upsertAccountLink(env, {
    supabaseUserId: pending.supabase_user_id,
    telegramId,
    telegramUsername: input.telegramUsername ?? null,
    telegramFirstName: input.telegramFirstName ?? null,
    friskyUserId: pending.frisky_user_id,
    friskyOrgId: pending.frisky_org_id,
    email: pending.email
  });
  if (!upsert.ok) return { ok: false, reason: "write_failed" };

  return {
    ok: true,
    supabaseUserId: pending.supabase_user_id,
    friskyUserId: pending.frisky_user_id,
    friskyOrgId: pending.frisky_org_id
  };
}

// --------------------------------------------------------------------------
// Reads (SoT). Consumers use these or RLS-select account_links directly.
// --------------------------------------------------------------------------
export async function getAccountLinkBySupabaseUser(env: BillingEnv, supabaseUserId: string): Promise<AccountLinkRow | null> {
  if (!accountLinksConfigured(env)) return null;
  const r = await fetch(
    `${restBase(env)}/account_links?supabase_user_id=eq.${encodeURIComponent(supabaseUserId)}&provider=eq.telegram&status=eq.linked&select=*&limit=1`,
    { headers: serviceHeaders(env) }
  ).catch(() => null);
  const rows = (await r?.json().catch(() => null)) as AccountLinkRow[] | null;
  return rows?.[0] ?? null;
}

export async function getAccountLinkByFriskyUser(env: BillingEnv, friskyUserId: string): Promise<AccountLinkRow | null> {
  if (!accountLinksConfigured(env)) return null;
  const r = await fetch(
    `${restBase(env)}/account_links?frisky_user_id=eq.${encodeURIComponent(friskyUserId)}&provider=eq.telegram&status=eq.linked&select=*&limit=1`,
    { headers: serviceHeaders(env) }
  ).catch(() => null);
  const rows = (await r?.json().catch(() => null)) as AccountLinkRow[] | null;
  return rows?.[0] ?? null;
}
