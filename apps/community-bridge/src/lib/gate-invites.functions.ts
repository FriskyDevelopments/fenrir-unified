import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireCommunitySession } from "@/lib/authentik.functions";
import { neonSql } from "@/lib/neon.server";

const gateId = z.string().uuid();
const tokenPattern = /^[A-Za-z0-9_-]{22,80}$/;

export type GateInvite = { token: string; status: "active" | "revoked"; url: string | null };

export async function ensureGateInviteTables(sql = neonSql()) {
  await sql`create table if not exists cb_gate_invites (
    token text primary key,
    gate_id uuid not null references cb_gate_configs(id) on delete cascade,
    status text not null check (status in ('active', 'revoked')) default 'active',
    created_at timestamptz not null default now(),
    revoked_at timestamptz
  )`;
  await sql`create unique index if not exists cb_gate_invites_one_active_per_gate
    on cb_gate_invites (gate_id) where status = 'active'`;
}

function freshToken(): string {
  // UUID v4 carries 122 bits of randomness and is URL-safe after removing
  // hyphens. Avoid Buffer/btoa so this stays safe in the Worker runtime.
  return crypto.randomUUID().replaceAll("-", "");
}

async function assertOwner(sql: ReturnType<typeof neonSql>, id: string, userId: string) {
  const rows = await sql`select id from cb_gate_configs where id = ${id} and user_id = ${userId} limit 1` as Record<string, unknown>[];
  if (!rows[0]) throw new Error("Gate not found or not owned by this Community account.");
}

function inviteUrl(token: string): string {
  const origin = process.env["VITE_SITE_URL"]?.trim() || "https://quality.communities.myfenrir.com";
  return `${origin.replace(/\/+$/, "")}/invite/${encodeURIComponent(token)}`;
}

async function activeInvite(sql: ReturnType<typeof neonSql>, id: string): Promise<string | null> {
  const rows = await sql`select token from cb_gate_invites where gate_id = ${id} and status = 'active' limit 1` as Record<string, unknown>[];
  return typeof rows[0]?.["token"] === "string" ? rows[0]["token"] : null;
}

export const getGateInvite = createServerFn({ method: "GET" })
  .middleware([requireCommunitySession])
  .inputValidator((data) => z.object({ gateId }).parse(data))
  .handler(async ({ context, data }): Promise<GateInvite> => {
    const sql = neonSql();
    await ensureGateInviteTables(sql);
    await assertOwner(sql, data.gateId, context.userId);
    let token = await activeInvite(sql, data.gateId);
    if (!token) {
      token = freshToken();
      await sql`insert into cb_gate_invites (token, gate_id) values (${token}, ${data.gateId})`;
    }
    return { token, status: "active", url: inviteUrl(token) };
  });

export const rotateGateInvite = createServerFn({ method: "POST" })
  .middleware([requireCommunitySession])
  .inputValidator((data) => z.object({ gateId }).parse(data))
  .handler(async ({ context, data }): Promise<GateInvite> => {
    const sql = neonSql();
    await ensureGateInviteTables(sql);
    await assertOwner(sql, data.gateId, context.userId);
    const token = freshToken();
    await sql.transaction([
      sql`update cb_gate_invites set status = 'revoked', revoked_at = now() where gate_id = ${data.gateId} and status = 'active'`,
      sql`insert into cb_gate_invites (token, gate_id) values (${token}, ${data.gateId})`,
    ]);
    return { token, status: "active", url: inviteUrl(token) };
  });

export const revokeGateInvite = createServerFn({ method: "POST" })
  .middleware([requireCommunitySession])
  .inputValidator((data) => z.object({ gateId }).parse(data))
  .handler(async ({ context, data }): Promise<GateInvite> => {
    const sql = neonSql();
    await ensureGateInviteTables(sql);
    await assertOwner(sql, data.gateId, context.userId);
    await sql`update cb_gate_invites set status = 'revoked', revoked_at = now() where gate_id = ${data.gateId} and status = 'active'`;
    return { token: "", status: "revoked", url: null };
  });

export async function resolveActiveGateInvite(token: string): Promise<{ slug: string } | null> {
  if (!tokenPattern.test(token)) return null;
  const sql = neonSql();
  await ensureGateInviteTables(sql);
  const rows = await sql`select g.slug from cb_gate_invites i join cb_gate_configs g on g.id = i.gate_id where i.token = ${token} and i.status = 'active' limit 1` as Record<string, unknown>[];
  return typeof rows[0]?.["slug"] === "string" ? { slug: String(rows[0]["slug"]) } : null;
}
