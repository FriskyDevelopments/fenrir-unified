import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireCommunitySession } from "@/lib/authentik.functions";
import { neonSql } from "@/lib/neon.server";
import { changedGateRuleKeys } from "@/lib/gate-member-acceptance";

const gateInput = z.object({ gateId: z.string().uuid() });

async function ensureMemberAcceptances(sql = neonSql()) {
  await sql`create table if not exists cb_gate_rule_acceptances (
    gate_id uuid not null,
    member_id uuid not null,
    rules_version integer not null,
    accepted_rules_text text not null,
    accepted_disclaimer_text text not null,
    accepted_at timestamptz not null default now(),
    primary key (gate_id, member_id)
  )`;
}

async function currentGate(sql: ReturnType<typeof neonSql>, gateId: string) {
  const rows = (await sql`select id, policy_version, rules_text, disclaimer_text
    from cb_gate_configs where id = ${gateId} limit 1`) as Record<string, unknown>[];
  if (!rows[0]) throw new Error("gate_not_found");
  return {
    gateId: String(rows[0]["id"]),
    rulesVersion: Number(rows[0]["policy_version"] ?? 1),
    rulesText: String(rows[0]["rules_text"] ?? ""),
    disclaimerText: String(rows[0]["disclaimer_text"] ?? ""),
  };
}

export const getGateMemberAcceptance = createServerFn({ method: "GET" })
  .middleware([requireCommunitySession])
  .inputValidator((data) => gateInput.parse(data))
  .handler(async ({ context, data }) => {
    const sql = neonSql();
    await ensureMemberAcceptances(sql);
    const gate = await currentGate(sql, data.gateId);
    const rows = (await sql`select rules_version, accepted_rules_text, accepted_disclaimer_text, accepted_at
      from cb_gate_rule_acceptances where gate_id = ${data.gateId} and member_id = ${context.userId} limit 1`) as Record<string, unknown>[];
    const previous = rows[0]
      ? {
          rulesVersion: Number(rows[0]["rules_version"]),
          rulesText: String(rows[0]["accepted_rules_text"]),
          disclaimerText: String(rows[0]["accepted_disclaimer_text"]),
        }
      : null;
    const changedRuleKeys = changedGateRuleKeys({
      currentVersion: gate.rulesVersion,
      currentRulesText: gate.rulesText,
      currentDisclaimerText: gate.disclaimerText,
      previous,
    });
    return {
      accepted: changedRuleKeys.length === 0,
      rulesUpdated: previous !== null && changedRuleKeys.length > 0,
      changedRuleKeys,
      acceptedAt: rows[0]?.["accepted_at"] ? new Date(rows[0]["accepted_at"] as string).toISOString() : null,
    };
  });

export const acceptGateRules = createServerFn({ method: "POST" })
  .middleware([requireCommunitySession])
  .inputValidator((data) => gateInput.parse(data))
  .handler(async ({ context, data }) => {
    const sql = neonSql();
    await ensureMemberAcceptances(sql);
    const gate = await currentGate(sql, data.gateId);
    const rows = (await sql`insert into cb_gate_rule_acceptances
      (gate_id, member_id, rules_version, accepted_rules_text, accepted_disclaimer_text)
      values (${gate.gateId}, ${context.userId}, ${gate.rulesVersion}, ${gate.rulesText}, ${gate.disclaimerText})
      on conflict (gate_id, member_id) do update set
        rules_version = excluded.rules_version,
        accepted_rules_text = excluded.accepted_rules_text,
        accepted_disclaimer_text = excluded.accepted_disclaimer_text,
        accepted_at = now()
      returning gate_id, member_id, rules_version, accepted_at`) as Record<string, unknown>[];
    return {
      gateId: String(rows[0]?.["gate_id"]),
      memberId: String(rows[0]?.["member_id"]),
      rulesVersion: Number(rows[0]?.["rules_version"]),
      acceptedAt: new Date(rows[0]?.["accepted_at"] as string).toISOString(),
    };
  });
