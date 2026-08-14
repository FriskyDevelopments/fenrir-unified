import { createServerFn } from "@tanstack/react-start";
import { requireCommunitySession } from "@/lib/authentik.functions";
import { neonSql } from "@/lib/neon.server";
import { HOST_STANDARDS_POLICY, HOST_STANDARDS_VERSION } from "@/lib/gate-onboarding";

async function ensureHostAcceptances(sql = neonSql()) {
  await sql`create table if not exists cb_account_acceptances (
    user_id uuid not null,
    policy_key text not null,
    policy_version integer not null,
    accepted_at timestamptz not null default now(),
    primary key (user_id, policy_key)
  )`;
}

export const getHostStandardsAcceptance = createServerFn({ method: "GET" })
  .middleware([requireCommunitySession])
  .inputValidator(() => undefined)
  .handler(async ({ context }) => {
    const sql = neonSql();
    await ensureHostAcceptances(sql);
    const rows = (await sql`select policy_version, accepted_at from cb_account_acceptances
      where user_id = ${context.userId} and policy_key = ${HOST_STANDARDS_POLICY} limit 1`) as Record<string, unknown>[];
    return rows[0]
      ? { acceptedVersion: Number(rows[0]["policy_version"]), acceptedAt: new Date(rows[0]["accepted_at"] as string).toISOString() }
      : { acceptedVersion: null, acceptedAt: null };
  });

export const acceptHostStandards = createServerFn({ method: "POST" })
  .middleware([requireCommunitySession])
  .inputValidator(() => undefined)
  .handler(async ({ context }) => {
    const sql = neonSql();
    await ensureHostAcceptances(sql);
    const rows = (await sql`insert into cb_account_acceptances (user_id, policy_key, policy_version)
      values (${context.userId}, ${HOST_STANDARDS_POLICY}, ${HOST_STANDARDS_VERSION})
      on conflict (user_id, policy_key) do update set policy_version = excluded.policy_version, accepted_at = now()
      returning policy_version, accepted_at`) as Record<string, unknown>[];
    return { acceptedVersion: Number(rows[0]?.["policy_version"]), acceptedAt: new Date(rows[0]?.["accepted_at"] as string).toISOString() };
  });
