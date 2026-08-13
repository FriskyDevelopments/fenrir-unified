#!/usr/bin/env node
// backfill-account-links.mjs — cross-system, IDEMPOTENT backfill into the SoT.
//
// The in-Supabase links (10 rows) are recovered by the SQL migration
// 20260809160100_backfill_account_links.sql. THIS script covers the other side:
// Cloudflare D1 -> Supabase account_links / account_billing. On 2026-08-09 D1 has
// 0 identity links and 0 billing customers, so today this is a no-op; it exists so
// that if D1 ever holds link/customer rows, they reconcile into the SoT safely.
//
// Idempotent: every write is a PostgREST upsert (merge-duplicates) keyed by a
// unique column, so re-running changes nothing.
//
// Requires (env): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Requires (PATH): wrangler, already OAuth-authenticated (no API tokens).
//
//   cd apps/fenrir-bridge
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node ../../ops/link-sot-consolidation/scripts/backfill-account-links.mjs
//
// Pass --dry to print what it WOULD write without writing.

import { execFileSync } from "node:child_process";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DRY = process.argv.includes("--dry");
const D1 = "fenrir-bridge";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

function d1Query(sql) {
  // wrangler OAuth session; --remote hits production D1 read-only here.
  const out = execFileSync(
    "wrangler",
    ["d1", "execute", D1, "--remote", "--json", "--command", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
  );
  const parsed = JSON.parse(out);
  // wrangler returns [{ results: [...] }]
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return block?.results ?? [];
}

async function sb(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  if (!res.ok) throw new Error(`Supabase ${init.method || "GET"} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function resolveUserId({ email, friskyUserId, telegramId }) {
  if (telegramId) {
    const rows = await sb(`account_links?provider=eq.telegram&telegram_id=eq.${Number(String(telegramId).replace(/\D/g, ""))}&select=supabase_user_id&limit=1`);
    if (rows[0]?.supabase_user_id) return rows[0].supabase_user_id;
  }
  if (email) {
    const rows = await sb(`profiles?email=eq.${encodeURIComponent(email)}&select=id&limit=1`);
    if (rows[0]?.id) return rows[0].id;
  }
  if (telegramId) {
    const rows = await sb(`telegram_identity_links?telegram_user_id=eq.${encodeURIComponent(String(telegramId))}&select=user_id&limit=1`);
    if (rows[0]?.user_id) return rows[0].user_id;
  }
  return null;
}

async function upsert(table, onConflict, row) {
  if (DRY) { console.log(`[dry] upsert ${table}`, row); return; }
  await sb(`${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row)
  });
}

async function main() {
  let links = [], customers = [];
  try {
    links = d1Query("SELECT telegram_user_id, frisky_user_id, frisky_org_id, email, telegram_username, telegram_first_name, linked_at FROM telegram_identity_links");
    customers = d1Query("SELECT frisky_org_id, frisky_user_id, stripe_customer_id, email FROM billing_customers");
  } catch (e) {
    console.error("Could not read D1 (is wrangler authenticated?):", e.message);
    process.exit(2);
  }
  console.log(`D1 rows → identity_links=${links.length}, billing_customers=${customers.length}`);

  let linked = 0, anchored = 0, skipped = 0;

  for (const l of links) {
    const uid = await resolveUserId({ email: l.email, friskyUserId: l.frisky_user_id, telegramId: l.telegram_user_id });
    if (!uid) { skipped++; console.warn(`skip link (unresolved): tg=${l.telegram_user_id} email=${l.email}`); continue; }
    await upsert("account_links", "supabase_user_id,provider", {
      supabase_user_id: uid,
      provider: "telegram",
      telegram_id: Number(String(l.telegram_user_id).replace(/\D/g, "")) || null,
      telegram_username: l.telegram_username || null,
      telegram_first_name: l.telegram_first_name || null,
      frisky_user_id: l.frisky_user_id || null,
      frisky_org_id: l.frisky_org_id || null,
      email: l.email || null,
      status: "linked",
      verified_at: l.linked_at || new Date().toISOString()
    });
    linked++;
  }

  for (const c of customers) {
    if (!c.stripe_customer_id || String(c.stripe_customer_id).startsWith("stars_")) continue;
    const uid = await resolveUserId({ email: c.email, friskyUserId: c.frisky_user_id });
    if (!uid) { skipped++; console.warn(`skip customer (unresolved): ${c.stripe_customer_id} email=${c.email}`); continue; }
    await upsert("account_billing", "supabase_user_id", {
      supabase_user_id: uid,
      stripe_customer_id: c.stripe_customer_id,
      frisky_user_id: c.frisky_user_id || null,
      frisky_org_id: c.frisky_org_id || null,
      email: c.email || null,
      updated_at: new Date().toISOString()
    });
    anchored++;
  }

  console.log(`Done. account_links upserts=${linked}, account_billing upserts=${anchored}, skipped=${skipped}${DRY ? " (dry-run)" : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
